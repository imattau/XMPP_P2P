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
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeTcp")
public class NativeTcpPlugin extends Plugin {
    private final ConcurrentHashMap<String, Socket> sockets = new ConcurrentHashMap<>();
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
                socket.connect(new InetSocketAddress(host, port), timeout);
                sockets.put(id, socket);
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
        Socket socket = id == null ? null : sockets.get(id);
        Object lock = id == null ? null : outputLocks.get(id);
        if (socket == null || lock == null || encoded == null) {
            call.reject("TCP socket is not open");
            return;
        }
        io.execute(() -> {
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                synchronized (lock) {
                    OutputStream output = socket.getOutputStream();
                    output.write(bytes);
                    output.flush();
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("TCP write failed: " + error.getMessage(), error);
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
            InputStream input = socket.getInputStream();
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count == 0) continue;
                byte[] chunk = new byte[count];
                System.arraycopy(buffer, 0, chunk, 0, count);
                JSObject event = new JSObject();
                event.put("socketId", id);
                event.put("data", Base64.encodeToString(chunk, Base64.NO_WRAP));
                notifyListeners("tcpData", event);
            }
            notifyClosed(id, null);
        } catch (Exception error) {
            if (!socket.isClosed()) notifyClosed(id, error.getMessage());
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
        Socket socket = sockets.remove(id);
        outputLocks.remove(id);
        if (socket != null) {
            try { socket.close(); } catch (Exception ignored) { }
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (String id : sockets.keySet()) closeSocket(id);
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
