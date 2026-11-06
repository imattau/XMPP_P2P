package app.nexus.xmpp;

import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.util.UUID;
import java.util.Enumeration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeTcp")
public class NativeTcpPlugin extends Plugin {
    private static final class SocketState {
        volatile Socket socket;
        // Fair so a blocking read cannot starve the STARTTLS upgrade; writes do not take it.
        final ReentrantLock ioLock = new ReentrantLock(true);
        SocketState(Socket socket) { this.socket = socket; }
    }
    private final ConcurrentHashMap<String, SocketState> sockets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> outputLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ServerSocket> servers = new ConcurrentHashMap<>();
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
    public void listen(PluginCall call) {
        String host = call.getString("host", "0.0.0.0");
        Integer port = call.getInt("port", 0);
        if (host == null || host.trim().isEmpty() || port == null || port < 0 || port > 65535) {
            call.reject("A valid TCP listen address is required");
            return;
        }
        io.execute(() -> {
            ServerSocket server = null;
            try {
                server = new ServerSocket();
                server.setReuseAddress(true);
                server.bind(new InetSocketAddress(InetAddress.getByName(host), port), 64);
                String listenerId = UUID.randomUUID().toString();
                servers.put(listenerId, server);

                JSObject result = new JSObject();
                result.put("listenerId", listenerId);
                result.put("port", server.getLocalPort());
                List<String> addresses = getListenAddresses(server.getInetAddress(), server.getLocalPort());
                result.put("addresses", addresses);
                call.resolve(result);
                ServerSocket listeningServer = server;
                io.execute(() -> acceptConnections(listenerId, listeningServer));
            } catch (Exception error) {
                if (server != null) try { server.close(); } catch (Exception ignored) { }
                call.reject("TCP listener failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        String listenerId = call.getString("listenerId");
        ServerSocket server = listenerId == null ? null : servers.remove(listenerId);
        if (server != null) {
            try { server.close(); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    private void acceptConnections(String listenerId, ServerSocket server) {
        while (!server.isClosed()) {
            try {
                Socket socket = server.accept();
                socket.setTcpNoDelay(true);
                socket.setKeepAlive(true);
                socket.setSoTimeout(500);
                String socketId = UUID.randomUUID().toString();
                sockets.put(socketId, new SocketState(socket));
                outputLocks.put(socketId, new Object());

                JSObject event = new JSObject();
                event.put("listenerId", listenerId);
                event.put("socketId", socketId);
                event.put("remoteHost", socket.getInetAddress().getHostAddress());
                event.put("remotePort", socket.getPort());
                notifyListeners("tcpAccepted", event);
                io.execute(() -> readSocket(socketId, socket));
            } catch (Exception error) {
                if (!server.isClosed()) Log.w("NativeTcp", "TCP accept failed", error);
                break;
            }
        }
        servers.remove(listenerId, server);
    }

    private List<String> getListenAddresses(InetAddress boundAddress, int port) {
        List<String> addresses = new ArrayList<>();
        if (!boundAddress.isAnyLocalAddress()) {
            addListenAddress(addresses, boundAddress, port);
            return addresses;
        }
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback()) continue;
                Enumeration<InetAddress> interfaceAddresses = network.getInetAddresses();
                while (interfaceAddresses.hasMoreElements()) {
                    addListenAddress(addresses, interfaceAddresses.nextElement(), port);
                }
            }
        } catch (Exception error) {
            Log.w("NativeTcp", "Could not enumerate local TCP addresses", error);
        }
        return addresses;
    }

    private void addListenAddress(List<String> addresses, InetAddress address, int port) {
        if (address.isLoopbackAddress() || address.isAnyLocalAddress() || address.isLinkLocalAddress()) return;
        if (address instanceof Inet4Address) {
            addresses.add("/ip4/" + address.getHostAddress() + "/tcp/" + port);
        }
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
                // Never take ioLock here: the reader holds it during blocking reads,
                // which would delay the client's stream open until the read timed out.
                synchronized (lock) {
                    OutputStream output = state.socket.getOutputStream();
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
                state.ioLock.lock();
                try {
                    SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                    SSLSocket ssl = (SSLSocket) factory
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
                } finally {
                    state.ioLock.unlock();
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
        String closeError = null;
        try {
            SocketState state = sockets.get(id);
            while (state != null) {
                try {
                    int count;
                    state.ioLock.lock();
                    try {
                        count = state.socket.getInputStream().read(buffer);
                    } finally {
                        state.ioLock.unlock();
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
        } catch (Exception error) {
            SocketState state = sockets.get(id);
            if (state != null && !state.socket.isClosed()) closeError = error.getMessage();
        } finally {
            closeSocket(id, closeError);
        }
    }

    private void notifyClosed(String id, String error) {
        JSObject event = new JSObject();
        event.put("socketId", id);
        if (error != null && !error.isEmpty()) event.put("error", error);
        notifyListeners("tcpClosed", event);
    }

    private void closeSocket(String id) {
        closeSocket(id, null);
    }

    private void closeSocket(String id, String error) {
        if (id == null) return;
        SocketState state = sockets.remove(id);
        outputLocks.remove(id);
        if (state != null) {
            notifyClosed(id, error);
            try { state.socket.close(); } catch (Exception ignored) { }
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (String id : sockets.keySet()) closeSocket(id);
        for (String id : servers.keySet()) {
            ServerSocket server = servers.remove(id);
            if (server != null) try { server.close(); } catch (Exception ignored) { }
        }
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
