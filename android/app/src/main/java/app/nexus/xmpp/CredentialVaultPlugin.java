package app.nexus.xmpp;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

@CapacitorPlugin(name = "CredentialVault")
public class CredentialVaultPlugin extends Plugin {
    private static final String KEY_ALIAS = "nexus-xmpp-credentials-v1";
    private static final String PREFS = "nexus_secure_credentials";
    private static final String CREDENTIALS = "xmpp_credentials";
    private static final byte[] AAD = "app.nexus.xmpp.credentials.v1".getBytes(StandardCharsets.UTF_8);

    @PluginMethod
    public void get(PluginCall call) {
        try {
            String encrypted = getContext().getSharedPreferences(PREFS, 0).getString(CREDENTIALS, null);
            JSObject result = new JSObject();
            if (encrypted != null) result.put("value", decrypt(encrypted));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not decrypt saved XMPP credentials", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("Credential value is required");
            return;
        }
        try {
            String encrypted = encrypt(value);
            boolean saved = getContext().getSharedPreferences(PREFS, 0).edit().putString(CREDENTIALS, encrypted).commit();
            if (!saved) throw new IllegalStateException("Credential storage write failed");
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not securely save XMPP credentials", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        boolean cleared = getContext().getSharedPreferences(PREFS, 0).edit().remove(CREDENTIALS).commit();
        if (cleared) call.resolve();
        else call.reject("Could not clear saved XMPP credentials");
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        cipher.updateAAD(AAD);
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] packed = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, packed, 0, iv.length);
        System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
        return Base64.encodeToString(packed, Base64.NO_WRAP);
    }

    private String decrypt(String encrypted) throws Exception {
        byte[] packed = Base64.decode(encrypted, Base64.NO_WRAP);
        if (packed.length <= 12) throw new IllegalArgumentException("Invalid encrypted credential data");
        byte[] iv = new byte[12];
        byte[] ciphertext = new byte[packed.length - iv.length];
        System.arraycopy(packed, 0, iv, 0, iv.length);
        System.arraycopy(packed, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        cipher.updateAAD(AAD);
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }
}
