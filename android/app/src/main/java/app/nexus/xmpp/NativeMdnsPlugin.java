package app.nexus.xmpp;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSArray;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.HashMap;
import java.util.UUID;

@CapacitorPlugin(name = "NativeMdns")
public class NativeMdnsPlugin extends Plugin {
    private static final String TAG = "NativeMdns";
    private static final String SERVICE_TYPE = "_p2p._udp.";

    private final ArrayDeque<NsdServiceInfo> resolveQueue = new ArrayDeque<>();
    private final Set<String> queuedServices = new HashSet<>();
    private final Map<String, NsdManager.RegistrationListener> registrations = new HashMap<>();
    private NsdManager nsdManager;
    private NsdManager.DiscoveryListener discoveryListener;
    private WifiManager.MulticastLock multicastLock;
    private boolean resolving;

    @PluginMethod
    public synchronized void startDiscovery(PluginCall call) {
        if (discoveryListener != null) {
            call.resolve();
            return;
        }

        nsdManager = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        if (nsdManager == null) {
            call.reject("Android network service discovery is unavailable");
            return;
        }

        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            multicastLock = wifiManager.createMulticastLock("NexusMdnsDiscovery");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        }

        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String serviceType) {
                Log.d(TAG, "mDNS discovery started for " + serviceType);
            }

            @Override public void onServiceFound(NsdServiceInfo serviceInfo) {
                synchronized (NativeMdnsPlugin.this) {
                    String name = serviceInfo.getServiceName();
                    if (discoveryListener == null || !queuedServices.add(name)) return;
                    resolveQueue.add(serviceInfo);
                    resolveNext();
                }
            }

            @Override public void onServiceLost(NsdServiceInfo serviceInfo) {
                synchronized (NativeMdnsPlugin.this) {
                    queuedServices.remove(serviceInfo.getServiceName());
                    resolveQueue.removeIf(item -> item.getServiceName().equals(serviceInfo.getServiceName()));
                }
            }

            @Override public void onDiscoveryStopped(String serviceType) {
                Log.d(TAG, "mDNS discovery stopped for " + serviceType);
            }

            @Override public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                Log.w(TAG, "Could not start mDNS discovery: " + errorCode);
                stopDiscoveryInternal();
            }

            @Override public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                Log.w(TAG, "Could not stop mDNS discovery: " + errorCode);
            }
        };

        try {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
            call.resolve();
        } catch (RuntimeException error) {
            stopDiscoveryInternal();
            call.reject("Could not start Android mDNS discovery", error);
        }
    }

    @PluginMethod
    public synchronized void setAdvertisedAddresses(PluginCall call) {
        JSArray addresses = call.getArray("multiaddrs");
        clearRegistrations();
        if (discoveryListener == null || nsdManager == null || addresses == null) {
            call.resolve();
            return;
        }
        for (int index = 0; index < addresses.length(); index++) {
            try {
                String address = addresses.getString(index);
                String ip = valueAfter(address, "/ip4/");
                String portValue = valueAfter(address, "/tcp/");
                if (ip == null || portValue == null || !address.contains("/p2p/")) continue;
                if (!java.net.InetAddress.getByName(ip).isSiteLocalAddress()) continue;
                int port = Integer.parseInt(portValue.split("/", 2)[0]);
                if (port < 1 || port > 65535) continue;
                String serviceName = "nexus-" + UUID.randomUUID().toString().replace("-", "");
                NsdServiceInfo service = new NsdServiceInfo();
                service.setServiceName(serviceName);
                service.setServiceType(SERVICE_TYPE);
                service.setPort(port);
                service.setAttribute("dnsaddr", address);
                NsdManager.RegistrationListener registrationListener = new NsdManager.RegistrationListener() {
                    @Override public void onServiceRegistered(NsdServiceInfo serviceInfo) {}
                    @Override public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        Log.w(TAG, "Could not advertise local peer address: " + errorCode);
                        synchronized (NativeMdnsPlugin.this) { registrations.remove(serviceName); }
                    }
                    @Override public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}
                    @Override public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        Log.w(TAG, "Could not stop local peer advertisement: " + errorCode);
                    }
                };
                registrations.put(serviceName, registrationListener);
                nsdManager.registerService(service, NsdManager.PROTOCOL_DNS_SD, registrationListener);
            } catch (Exception error) {
                Log.w(TAG, "Could not advertise local peer address", error);
            }
        }
        call.resolve();
    }

    private String valueAfter(String address, String protocol) {
        int start = address.indexOf(protocol);
        if (start < 0) return null;
        start += protocol.length();
        int end = address.indexOf('/', start);
        return end < 0 ? address.substring(start) : address.substring(start, end);
    }

    @PluginMethod
    public synchronized void stopDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        call.resolve();
    }

    private synchronized void resolveNext() {
        if (resolving || discoveryListener == null || resolveQueue.isEmpty()) return;
        NsdServiceInfo service = resolveQueue.poll();
        resolving = true;
        try {
            nsdManager.resolveService(service, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                    synchronized (NativeMdnsPlugin.this) {
                        resolving = false;
                        resolveNext();
                    }
                }

                @Override public void onServiceResolved(NsdServiceInfo serviceInfo) {
                    try {
                        Map<String, byte[]> attributes = serviceInfo.getAttributes();
                        for (Map.Entry<String, byte[]> entry : attributes.entrySet()) {
                            if (!"dnsaddr".equalsIgnoreCase(entry.getKey())) continue;
                            String dnsaddr = new String(entry.getValue(), StandardCharsets.UTF_8).trim();
                            if (dnsaddr.startsWith("/")) {
                                JSObject event = new JSObject();
                                event.put("dnsaddr", dnsaddr);
                                notifyListeners("peerDiscovered", event);
                            }
                        }
                    } catch (RuntimeException error) {
                        Log.w(TAG, "Could not read peer mDNS record", error);
                    } finally {
                        synchronized (NativeMdnsPlugin.this) {
                            resolving = false;
                            resolveNext();
                        }
                    }
                }
            });
        } catch (RuntimeException error) {
            resolving = false;
            Log.w(TAG, "Could not resolve mDNS peer", error);
            resolveNext();
        }
    }

    private synchronized void stopDiscoveryInternal() {
        clearRegistrations();
        if (discoveryListener != null && nsdManager != null) {
            try { nsdManager.stopServiceDiscovery(discoveryListener); }
            catch (IllegalArgumentException ignored) { }
        }
        discoveryListener = null;
        resolveQueue.clear();
        queuedServices.clear();
        resolving = false;
        if (multicastLock != null) {
            if (multicastLock.isHeld()) multicastLock.release();
            multicastLock = null;
        }
    }

    private synchronized void clearRegistrations() {
        if (nsdManager == null) return;
        for (NsdManager.RegistrationListener registration : registrations.values()) {
            try { nsdManager.unregisterService(registration); }
            catch (IllegalArgumentException ignored) { }
        }
        registrations.clear();
    }

    @Override
    protected void handleOnDestroy() {
        stopDiscoveryInternal();
        super.handleOnDestroy();
    }
}
