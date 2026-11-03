package app.nexus.xmpp;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeTcp")
public class NativeTcpPlugin extends Plugin {
    private static final class SocketState {
        volatile Socket socket;
        final Object ioLock = new Object();
        SocketState(Socket socket) { this.socket = socket; }
    }
    private final ConcurrentHashMap<String, SocketState> sockets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> outputLocks = new ConcurrentHashMap<>();
    private final ExecutorService io = Executors.newCachedThreadPool();

    @PluginMethod
    public void open(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        Integer timeout = call.getInt("timeoutMs", 15000);
        if (host == null || host.trim().isEmpty() || port == null || port < 1 || port > 65535) {
            call.reject("A valid TCP host and port are required");
            return;
        }

        io.execute(() -> {
            String id = UUID.randomUUID().toString();
            Socket socket = new Socket();
            try {
                socket.setTcpNoDelay(true);
                socket.setKeepAlive(true);
                socket.setSoTimeout(500);
                socket.connect(new InetSocketAddress(host, port), timeout);
                sockets.put(id, new SocketState(socket));
                outputLocks.put(id, new Object());

                JSObject result = new JSObject();
                result.put("socketId", id);
                call.resolve(result);

                io.execute(() -> readSocket(id, socket));
            } catch (Exception error) {
                try { socket.close(); } catch (Exception ignored) { }
                call.reject("TCP connection failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        String id = call.getString("socketId");
        String encoded = call.getString("data");
        SocketState state = id == null ? null : sockets.get(id);
        Object lock = id == null ? null : outputLocks.get(id);
        if (state == null || lock == null || encoded == null) {
            call.reject("TCP socket is not open");
            return;
        }
        io.execute(() -> {
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                synchronized (lock) {
                    synchronized (state.ioLock) {
                        OutputStream output = state.socket.getOutputStream();
                        output.write(bytes);
                        output.flush();
                    }
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("TCP write failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void startTls(PluginCall call) {
        String id = call.getString("socketId");
        String host = call.getString("host");
        SocketState state = id == null ? null : sockets.get(id);
        if (state == null || host == null || host.trim().isEmpty()) {
            call.reject("An open TCP socket and TLS hostname are required");
            return;
        }
        io.execute(() -> {
            try {
                String protocol;
                synchronized (state.ioLock) {
                    SSLSocket ssl = (SSLSocket) SSLSocketFactory.getDefault()
                        .createSocket(state.socket, host, state.socket.getPort(), true);
                    ssl.setUseClientMode(true);
                    SSLParameters parameters = ssl.getSSLParameters();
                    parameters.setEndpointIdentificationAlgorithm("HTTPS");
                    ssl.setSSLParameters(parameters);
                    ssl.setSoTimeout(15000);
                    ssl.startHandshake();
                    protocol = ssl.getSession().getProtocol();
                    ssl.setSoTimeout(500);
                    state.socket = ssl;
                }
                JSObject result = new JSObject();
                result.put("protocol", protocol);
                call.resolve(result);
            } catch (Exception error) {
                closeSocket(id);
                call.reject("TLS negotiation failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        String id = call.getString("socketId");
        closeSocket(id);
        call.resolve();
    }

    private void readSocket(String id, Socket socket) {
        byte[] buffer = new byte[32 * 1024];
        try {
            SocketState state = sockets.get(id);
            while (state != null) {
                try {
                    int count;
                    synchronized (state.ioLock) {
                        count = state.socket.getInputStream().read(buffer);
                    }
                    if (count < 0) break;
                    if (count == 0) continue;
                    byte[] chunk = new byte[count];
                    System.arraycopy(buffer, 0, chunk, 0, count);
                    JSObject event = new JSObject();
                    event.put("socketId", id);
                    event.put("data", Base64.encodeToString(chunk, Base64.NO_WRAP));
                    notifyListeners("tcpData", event);
                } catch (SocketTimeoutException timeout) {
                    state = sockets.get(id);
                }
            }
            notifyClosed(id, null);
        } catch (Exception error) {
            SocketState state = sockets.get(id);
            if (state != null && !state.socket.isClosed()) notifyClosed(id, error.getMessage());
        } finally {
            closeSocket(id);
        }
    }

    private void notifyClosed(String id, String error) {
        JSObject event = new JSObject();
        event.put("socketId", id);
        if (error != null && !error.isEmpty()) event.put("error", error);
        notifyListeners("tcpClosed", event);
    }

    private void closeSocket(String id) {
        if (id == null) return;
        SocketState state = sockets.remove(id);
        outputLocks.remove(id);
        if (state != null) {
            notifyClosed(id, null);
            try { state.socket.close(); } catch (Exception ignored) { }
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (String id : sockets.keySet()) closeSocket(id);
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
