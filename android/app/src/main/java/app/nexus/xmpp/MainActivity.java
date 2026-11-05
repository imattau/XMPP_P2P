package app.nexus.xmpp;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeTcpPlugin.class);
        registerPlugin(CredentialVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
