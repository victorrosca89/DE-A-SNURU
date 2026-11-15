package com.deasnuru.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Serviciu în prim-plan (foreground) care ține jocul viu cât timp telefonul e blocat / aplicația minimizată:
 *  - citește GPS-ul și trimite poziția la server (HTTP);
 *  - interoghează starea jocului la 3 secunde și afișează o notificare interactivă (cronometru, rol, coordonate, detalii);
 *  - declanșează alerte (SOS, Seeker aproape, prins, ping, start/sfârșit de rundă) chiar dacă ecranul e stins.
 */
public class GameService extends Service {
    static final String CH_LIVE = "dn_live_v1", CH_ALERT = "dn_alert_v1", CH_SOS = "dn_sos_v1";
    static final int ID_LIVE = 4001, ID_SOS = 4003;
    static final String ACTION_LEAVE = "com.deasnuru.app.LEAVE";
    static volatile boolean appVisible = false;

    private String api = "", code = "", user = "", tok = "", name = "";
    private ScheduledExecutorService exec;
    private LocationManager lm;
    private volatile Location loc;
    private volatile long lastPosSent = 0;
    private PowerManager.WakeLock wl;
    private boolean started = false;
    private volatile JSONObject last;
    private volatile int lastHttp = 0;
    private volatile long lastRtt = 0, lastOkAt = 0;
    private volatile double clockOff = 0;
    private int failCount = 0, nextId = 5000;
    private long idleSince = 0, startedAt = 0;
    private Bitmap logo;

    // starea anterioară (pentru a detecta schimbările și a trimite alerte)
    private String pPhase = null, pSt = "", pSosKey = "";
    private boolean pNear = false, pOut = false;
    private int pRound = -1;
    private double pPing = 0;
    private boolean w30 = false, w60 = false;
    private int pNh = -1, pTotal = -1;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        channels();
        exec = Executors.newScheduledThreadPool(2);
        try {
            int id = getResources().getIdentifier("logo_large", "drawable", getPackageName());
            if (id != 0) logo = BitmapFactory.decodeResource(getResources(), id);
        } catch (Exception e) { logo = null; }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences sp = getSharedPreferences("dn", MODE_PRIVATE);
        if (intent != null && intent.hasExtra("code")) {
            sp.edit().putString("api", intent.getStringExtra("api")).putString("code", intent.getStringExtra("code"))
                .putString("user", intent.getStringExtra("user")).putString("tok", intent.getStringExtra("tok"))
                .putString("name", intent.getStringExtra("name")).apply();
        }
        api = sp.getString("api", ""); code = sp.getString("code", ""); user = sp.getString("user", "");
        tok = sp.getString("tok", ""); name = sp.getString("name", "");
        if (api == null || api.isEmpty() || code == null || code.isEmpty() || user == null || user.isEmpty()) { stopSelf(); return START_NOT_STICKY; }
        api = api.replaceAll("/+$", "");
        if (intent != null && ACTION_LEAVE.equals(intent.getAction())) { doLeave(); return START_NOT_STICKY; }
        try {
            Notification n = buildLive(null, false);
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID_LIVE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(ID_LIVE, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        if (!started) {
            started = true; startedAt = System.currentTimeMillis();
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "deasnuru:game");
                wl.acquire(8L * 60 * 60 * 1000);
            } catch (Exception e) { wl = null; }
            startLocation();
            exec.scheduleWithFixedDelay(new Runnable() { @Override public void run() { poll(); } }, 1, 3, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        try { if (lm != null) lm.removeUpdates(listener); } catch (Exception e) { }
        try { if (exec != null) exec.shutdownNow(); } catch (Exception e) { }
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { }
        try { NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE); nm.cancel(ID_SOS); } catch (Exception e) { }
        try { stopForeground(true); } catch (Exception e) { }
        getSharedPreferences("dn", MODE_PRIVATE).edit().remove("code").apply();
        super.onDestroy();
    }

    /** Buton „Ieși” din notificare: părăsește camera și oprește serviciul. */
    private void doLeave() {
        final String c = code, u = user, t = tok;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject b = new JSONObject();
                    b.put("user", u); b.put("tok", t);
                    http("POST", "/api/room/" + enc(c) + "/leave", b.toString());
                } catch (Exception e) { }
                stopSelf();
            }
        }).start();
    }

    // ------------------------------------------------------------------ GPS
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            if (l == null) return;
            Location c = loc;
            boolean gps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
            if (c == null || gps || System.currentTimeMillis() - c.getTime() > 15000) { loc = l; sendPos(); }
        }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
    };

    private void startLocation() {
        try {
            lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 0f, listener, Looper.getMainLooper());
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 0f, listener, Looper.getMainLooper());
            Location l = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (l != null && System.currentTimeMillis() - l.getTime() < 120000) loc = l;
        } catch (SecurityException e) {
        } catch (Exception e) { }
    }

    private void sendPos() {
        final Location l = loc;
        if (l == null || exec == null) return;
        long n = System.currentTimeMillis();
        if (n - lastPosSent < 2500) return;
        lastPosSent = n;
        try {
            final JSONObject b = new JSONObject();
            b.put("user", user); b.put("tok", tok); b.put("lat", l.getLatitude()); b.put("lng", l.getLongitude());
            if (l.hasAccuracy()) b.put("acc", (double) l.getAccuracy());
            exec.execute(new Runnable() { @Override public void run() { http("POST", "/api/room/" + enc(code) + "/pos", b.toString()); } });
        } catch (Exception e) { }
    }

    // ------------------------------------------------------------------ rețea
    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private String http(String method, String path, String body) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(api + path).openConnection();
            c.setConnectTimeout(6000); c.setReadTimeout(8000); c.setRequestMethod(method);
            c.setRequestProperty("Accept", "application/json");
            if (body != null) {
                c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json");
                OutputStream os = c.getOutputStream();
                os.write(body.getBytes("UTF-8")); os.flush(); os.close();
            }
            int status = c.getResponseCode();
            lastHttp = status;
            InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String out = "";
            if (is != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[4096]; int r;
                while ((r = is.read(buf)) > 0) bo.write(buf, 0, r);
                is.close();
                out = bo.toString("UTF-8");
            }
            return status < 400 ? out : null;
        } catch (Exception e) {
            lastHttp = -1; return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void poll() {
        try {
            long t0 = System.currentTimeMillis();
            sendPos();
            String s = http("GET", "/api/room/" + enc(code) + "/state?user=" + enc(user) + "&tok=" + enc(tok), null);
            if (s == null) {
                failCount++;
                if ((lastHttp == 404 || lastHttp == 403) && failCount >= 3) {
                    alert("Conexiunea cu camera s-a pierdut", "Camera nu mai există sau jocul a fost resetat. Deschide aplicația.", CH_ALERT, false, false, 0xFFFF3B30);
                    stopSelf(); return;
                }
                notifyLive(buildLive(last, true));
                return;
            }
            failCount = 0; lastRtt = System.currentTimeMillis() - t0; lastOkAt = System.currentTimeMillis();
            JSONObject st = new JSONObject(s);
            clockOff = System.currentTimeMillis() - st.optDouble("now", 0) * 1000.0;
            last = st;
            diff(st);
            notifyLive(buildLive(st, false));
            String phase = st.optString("phase", "");
            boolean idle = "lobby".equals(phase) || "over".equals(phase);
            long n = System.currentTimeMillis();
            if (idle && !appVisible) { if (idleSince == 0) idleSince = n; else if (n - idleSince > 20 * 60 * 1000L) { stopSelf(); return; } } else idleSince = 0;
            if (n - startedAt > 8L * 3600 * 1000) stopSelf();
        } catch (Throwable e) { }
    }

    // ------------------------------------------------------------------ alerte
    private static String s(JSONObject o, String k) {
        if (o == null || o.isNull(k)) return "";
        return o.optString(k, "");
    }

    private static int roleColor(boolean spec, boolean hider, boolean lost) {
        return spec ? 0xFF0A84FF : lost ? 0xFF8E8E93 : hider ? 0xFFFF3B30 : 0xFFFFD60A;
    }

    @SuppressWarnings("deprecation")
    private void wakeScreen() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null || pm.isInteractive() || appVisible) return;
            PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "deasnuru:wake");
            w.acquire(4000);
        } catch (Exception e) { }
    }

    private void diff(JSONObject st) {
        String phase = s(st, "phase");
        JSONObject me = st.optJSONObject("me");
        String role = s(me, "role"), mst = s(me, "st");
        boolean spec = "spectator".equals(role) || (me != null && me.optBoolean("spec", false));
        boolean near = !spec && me != null && me.optBoolean("near", false);
        boolean out = !spec && me != null && !me.isNull("out");
        int round = st.optInt("round", 0), nh = st.optInt("nh", 0), total = st.optInt("total", 0);
        double pingAt = st.optDouble("ping_at", 0);
        JSONObject sos = st.isNull("sos") ? null : st.optJSONObject("sos");
        String sosKey = sos == null ? "" : (s(sos, "u") + ":" + sos.optDouble("t", 0));
        boolean first = pPhase == null;
        if (!"sos".equals(phase) || appVisible) cancelSos();
        if (round != pRound) { w30 = false; w60 = false; }
        if (!first && !appVisible) {
            boolean hider = "hider".equals(role);
            String rl = spec ? "SPECTATOR" : hider ? "HIDER" : "SEEKER";
            int rc = roleColor(spec, hider, false);
            double nowS = (System.currentTimeMillis() - clockOff) / 1000.0;
            if ("sos".equals(phase) && sos != null && !sosKey.equals(pSosKey)) {
                sosAlert(st, sos);
            } else if (!"sos".equals(phase) && "sos".equals(pPhase)) {
                cancelSos();
                alert("SOS încheiat", "Alerta SOS a fost închisă. Revii în cameră.", CH_ALERT, false, false, 0xFF30D158, 30000);
            }
            if ("hiding".equals(phase) && ("lobby".equals(pPhase) || "over".equals(pPhase) || round != pRound))
                alert("Jocul a început — ești " + rl, spec ? "Privești jocul și vezi locația tuturor, în direct." : hider ? "Ascunde-te! Seekerii pornesc după cronometru." : "Hiderii se ascund. Așteaptă cronometrul.", CH_ALERT, true, false, rc);
            if ("hiding".equals(phase)) {
                double r = st.optDouble("hide_end", 0) - nowS;
                if (!w30 && r > 0 && r <= 30) {
                    w30 = true;
                    alert("30 de secunde!", spec ? "Seekerii pornesc imediat." : hider ? "Seekerii pornesc în 30 s. Ascunde-te bine." : "Pornești în 30 s. Pregătește-te.", CH_ALERT, true, false, rc);
                }
            }
            if ("hiding".equals(pPhase) && "playing".equals(phase))
                alert(hider ? "Seekerii au pornit!" : spec ? "Vânătoarea a început" : "Vânătoarea a început!", hider ? "Rămâi ascuns și nu te lăsa prins." : spec ? "Urmărești Hiderii și Seekerii pe hartă." : "Găsește toți Hiderii. Locațiile se reîmprospătează la 3 minute.", CH_ALERT, true, false, 0xFFFFD60A);
            if ("playing".equals(phase)) {
                double end = st.optDouble("end_at", 0), r = end - nowS;
                if (end > 0 && !w60 && r > 0 && r <= 60) {
                    w60 = true;
                    alert("Mai e 1 minut", hider ? "Rezistă — Hiderii câștigă dacă expiră timpul." : spec ? "Jocul se încheie în 60 de secunde." : "Găsește-i acum pe Hiderii rămași!", CH_ALERT, true, false, rc);
                }
            }
            if ("over".equals(phase) && !"over".equals(pPhase)) {
                String w = "seekers".equals(s(st, "winner")) ? "Seekerii au câștigat" : "Hiderii au câștigat";
                String why = s(st, "why");
                String r = "time".equals(why) ? "Timpul s-a scurs." : "all_caught".equals(why) ? "Toți Hiderii au fost prinși." : "seekers_left".equals(why) ? "Seekerii au plecat." : "";
                alert("Joc terminat — " + w, r, CH_ALERT, true, false, 0xFF0A84FF);
            }
            if (near && !pNear) alert("Seeker la sub 30 m!", "Fugi sau ascunde-te acum.", CH_ALERT, true, false, 0xFFFF3B30);
            if (out && !pOut) alert("Ești la peste 1 km de Seeker", "Revino în apropiere, altfel ești eliminat.", CH_ALERT, false, false, 0xFFFF9500);
            if (!spec && "caught".equals(mst) && "alive".equals(pSt)) alert("Ai fost prins", "Ai pierdut runda. Deschide aplicația: SOS sau intră ca spectator.", CH_ALERT, true, false, 0xFF8E8E93);
            if ("playing".equals(phase) && "playing".equals(pPhase) && pNh >= 0 && nh < pNh && !"caught".equals(mst))
                alert("Un Hider a fost prins", "Mai " + (nh == 1 ? "rămâne 1 Hider" : "rămân " + nh + " Hideri") + " în joc.", CH_ALERT, false, false, 0xFFFF3B30);
            if ("lobby".equals(phase) && "lobby".equals(pPhase) && pTotal >= 0 && total != pTotal)
                alert(total > pTotal ? "Un jucător a intrat în cameră" : "Un jucător a ieșit din cameră", total + " în cameră.", CH_ALERT, false, false, 0xFF0A84FF, 20000);
            if ("playing".equals(phase) && "playing".equals(pPhase) && pingAt > pPing + 1 && !"caught".equals(mst) && !spec)
                alert(hider ? "Ești vizibil pentru Seekeri!" : "Locațiile Hiderilor s-au actualizat", hider ? "Poziția ta tocmai a fost dezvăluită. Mută-te!" : "Deschide harta pentru noile poziții.", CH_ALERT, hider, false, hider ? 0xFFFF9500 : 0xFF0A84FF);
        }
        pPhase = phase; pSt = mst; pNear = near; pOut = out; pRound = round; pPing = pingAt; pSosKey = sosKey; pNh = nh; pTotal = total;
    }

    private void sosAlert(JSONObject st, JSONObject sos) {
        wakeScreen();
        boolean mine = user.equals(s(sos, "u"));
        String who = s(sos, "n");
        String title, text;
        if (mine) {
            title = "SOS trimis"; text = "Jocul s-a oprit. Rămâi pe loc — ceilalți vin spre tine.";
        } else {
            title = "SOS de la " + who + " — mergi la el!";
            text = "Jocul s-a oprit. Locația tuturor este vizibilă pe hartă.";
            Location l = loc;
            if (l != null && !sos.isNull("lat")) text += " Distanță: " + fmtDist(hav(l.getLatitude(), l.getLongitude(), sos.optDouble("lat"), sos.optDouble("lng")));
        }
        Notification.Builder b = nb(CH_SOS);
        b.setSmallIcon(smallIcon()).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setPriority(Notification.PRIORITY_MAX).setCategory(Notification.CATEGORY_ALARM)
            .setColor(0xFFFF3B30).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(false, 1, true))
            .setFullScreenIntent(openApp(false, 3, true), true);
        if (logo != null) b.setLargeIcon(logo);
        if (Build.VERSION.SDK_INT < 26) { b.setDefaults(Notification.DEFAULT_ALL); }
        else b.setTimeoutAfter(60 * 1000L);   // nu rămâne permanent în bara de notificări
        if (!mine && !sos.isNull("lat")) b.addAction(0, "Navighează", navIntent(sos.optDouble("lat"), sos.optDouble("lng")));
        b.addAction(0, "Deschide", openApp(false, 1, true));
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;   // sunetul se repetă până deschizi notificarea
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ID_SOS, n); } catch (Exception e) { }
    }

    private void alert(String title, String text, String ch, boolean full, boolean insist, int color) {
        alert(title, text, ch, full, insist, color, 0);
    }

    /** Elimină notificarea SOS (situația s-a încheiat sau aplicația este deschisă). */
    private void cancelSos() {
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(ID_SOS); } catch (Exception e) { }
    }

    private void alert(String title, String text, String ch, boolean full, boolean insist, int color, long timeoutMs) {
        if (full) wakeScreen();
        try {
            Notification.Builder b = nb(ch);
            b.setSmallIcon(smallIcon()).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setPriority(Notification.PRIORITY_HIGH).setCategory(Notification.CATEGORY_MESSAGE)
                .setColor(color).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(false, 1, false));
            if (logo != null) b.setLargeIcon(logo);
            if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL);
            else if (timeoutMs > 0) b.setTimeoutAfter(timeoutMs);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(nextId++, b.build());
            if (nextId > 5200) nextId = 5000;
        } catch (Exception e) { }
    }

    // ------------------------------------------------------------------ notificarea live (cronometru, poziție, detalii)
    private void notifyLive(Notification n) {
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ID_LIVE, n); } catch (Exception e) { }
    }

    private long devMs(double serverSec) { return (long) (serverSec * 1000.0 + clockOff); }
    private String clock(double serverSec) { return new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(devMs(serverSec))); }

    private Notification buildLive(JSONObject st, boolean offline) {
        Notification.Builder b = nb(CH_LIVE);
        Location l = loc;
        String title, text, sub = "Cameră " + code + " · @" + user;
        StringBuilder big = new StringBuilder();
        int color = 0xFF2A2A2E;
        boolean chrono = false, down = true; long chronoMs = 0;
        if (st == null) {
            title = "DE-A ȘNURU' · se conectează…"; text = "Pornesc GPS-ul și conexiunea cu serverul";
            big.append("Cameră ").append(code).append(" · @").append(user);
        } else {
            String phase = s(st, "phase");
            JSONObject me = st.optJSONObject("me");
            String role = s(me, "role");
            boolean hider = "hider".equals(role), seeker = "seeker".equals(role);
            boolean spec = "spectator".equals(role) || (me != null && me.optBoolean("spec", false));
            boolean lost = !spec && me != null && !s(me, "st").isEmpty() && !"alive".equals(s(me, "st"));
            JSONObject sos = st.isNull("sos") ? null : st.optJSONObject("sos");
            int live = st.optInt("live", 0), total = st.optInt("total", 0), nh = st.optInt("nh", 0), ns = st.optInt("ns", 0);
            String roleTxt = spec ? "SPECTATOR · privești jocul" : lost ? "PIERDUT · poți intra ca spectator" : seeker ? "SEEKER · caută Hiderii" : hider ? "HIDER · se ascunde" : "—";
            String phaseTxt = "lobby".equals(phase) ? "În cameră (lobby)" : "hiding".equals(phase) ? "Ascundere" : "playing".equals(phase) ? "În joc" : "over".equals(phase) ? "Joc terminat" : "SOS ACTIV";
            color = "sos".equals(phase) ? 0xFFFF3B30 : spec ? 0xFF0A84FF : lost ? 0xFF8E8E93 : seeker ? 0xFFFFD60A : hider ? 0xFFFF3B30 : 0xFF2A2A2E;
            String tag = "sos".equals(phase) ? "SOS" : spec ? "SPECTATOR" : seeker ? "SEEKER" : hider ? "HIDER" : "DE-A ȘNURU'";
            title = tag + " · " + phaseTxt;
            if (lost) title = tag + " · PIERDUT";
            // cronometru nativ (merge singur, chiar și cu ecranul stins)
            if ("hiding".equals(phase)) { chrono = true; chronoMs = devMs(st.optDouble("hide_end", 0)); }
            else if ("playing".equals(phase)) {
                double end = st.optDouble("end_at", 0);
                chrono = true; chronoMs = devMs(end > 0 ? end : st.optDouble("ping_at", 0));
            } else if ("sos".equals(phase) && sos != null) { chrono = true; down = false; chronoMs = devMs(sos.optDouble("t", 0)); }
            // text compact
            String nearTxt = "";
            double myLa = l != null ? l.getLatitude() : Double.NaN, myLn = l != null ? l.getLongitude() : Double.NaN;
            String nearName = "";
            double best = Double.MAX_VALUE;
            JSONArray ps = st.optJSONArray("players");
            if (ps != null && l != null && !"sos".equals(phase)) {
                for (int i = 0; i < ps.length(); i++) {
                    JSONObject p = ps.optJSONObject(i);
                    if (p == null || user.equals(s(p, "u")) || p.isNull("lat")) continue;
                    String pr = s(p, "role");
                    boolean want = hider ? "seeker".equals(pr) : seeker ? ("hider".equals(pr) && "alive".equals(s(p, "st"))) : false;
                    if (!want) continue;
                    double d = hav(myLa, myLn, p.optDouble("lat"), p.optDouble("lng"));
                    if (d < best) { best = d; nearName = s(p, "n"); }
                }
                if (best < Double.MAX_VALUE) nearTxt = (hider ? "Seeker cel mai aproape: " : "Hider (ultimul ping): ") + fmtDist(best) + " (" + nearName + ")";
            }
            if ("sos".equals(phase) && sos != null) {
                boolean mine = user.equals(s(sos, "u"));
                if (mine) { text = "Ai cerut ajutor · rămâi pe loc"; title = "SOS · AȘTEPȚI AJUTOR"; }
                else if (l != null && !sos.isNull("lat")) {
                    double d = hav(myLa, myLn, sos.optDouble("lat"), sos.optDouble("lng")), bg = bearing(myLa, myLn, sos.optDouble("lat"), sos.optDouble("lng"));
                    text = s(sos, "n") + " · " + fmtDist(d) + " · direcție " + compass(bg);
                    title = "SOS · mergi la " + s(sos, "n");
                } else text = s(sos, "n") + " are nevoie de ajutor";
            } else if ("lobby".equals(phase)) text = live + " jucători live în cameră · așteptăm startul";
            else text = "Live " + live + "/" + total + " · Hideri " + nh + " · Seekeri " + ns + (nearTxt.isEmpty() ? "" : " · " + fmtDist(best));
            // detalii extinse
            big.append("Rol: ").append(roleTxt).append("\n");
            big.append("Fază: ").append(phaseTxt).append(" · Runda ").append(st.optInt("round", 0)).append("\n");
            if ("hiding".equals(phase)) big.append("Seekerii pornesc la ").append(clock(st.optDouble("hide_end", 0))).append("\n");
            if ("playing".equals(phase)) {
                double end = st.optDouble("end_at", 0);
                if (end > 0) big.append("Final joc la ").append(clock(end)).append(" (Hiderii câștigă dacă expiră)\n"); else big.append("Joc nelimitat\n");
                big.append("Următorul ping Hideri la ").append(clock(st.optDouble("ping_at", 0))).append("\n");
            }
            if ("sos".equals(phase) && sos != null) {
                big.append("SOS de la ").append(s(sos, "n")).append("\n");
                if (!sos.isNull("lat")) big.append(String.format(Locale.US, "Locația SOS: %.6f, %.6f\n", sos.optDouble("lat"), sos.optDouble("lng")));
            }
            if (l != null) {
                big.append(String.format(Locale.US, "Poziția mea: %.6f, %.6f", l.getLatitude(), l.getLongitude()));
                if (l.hasAccuracy()) big.append(String.format(Locale.US, " (±%.0f m)", l.getAccuracy()));
                big.append("\n");
                StringBuilder mv = new StringBuilder();
                if (l.hasSpeed()) mv.append(String.format(Locale.US, "Viteză %.1f km/h", l.getSpeed() * 3.6f));
                if (l.hasBearing() && l.getSpeed() > 0.6f) { if (mv.length() > 0) mv.append(" · "); mv.append(String.format(Locale.US, "Direcție %.0f° %s", l.getBearing(), compass(l.getBearing()))); }
                if (l.hasAltitude() && l.getAltitude() != 0) { if (mv.length() > 0) mv.append(" · "); mv.append(String.format(Locale.US, "Alt. %.0f m", l.getAltitude())); }
                if (mv.length() > 0) big.append(mv).append("\n");
            } else big.append("Poziția mea: se caută GPS…\n");
            big.append("Jucători: ").append(live).append(" live din ").append(total).append(" · Hideri ").append(nh).append(" · Seekeri ").append(ns).append("\n");
            if (!nearTxt.isEmpty()) big.append(nearTxt).append("\n");
            big.append("Baterie ").append(battery()).append("% · GPS ").append(l != null ? "OK" : "…").append(" · Server ").append(offline ? "OFFLINE" : "OK " + lastRtt + " ms");
        }
        b.setSmallIcon(smallIcon()).setContentTitle(title).setContentText(text == null ? "" : text)
            .setSubText(sub).setStyle(new Notification.BigTextStyle().bigText(big.toString()))
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
            .setColor(color).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(false, 1, false));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        if (logo != null) b.setLargeIcon(logo);
        if (chrono) {
            b.setShowWhen(true).setWhen(chronoMs).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(down);
        } else b.setShowWhen(false);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        // butoane interactive
        JSONObject sosObj = (st == null || st.isNull("sos")) ? null : st.optJSONObject("sos");
        if (sosObj != null && !user.equals(s(sosObj, "u")) && !sosObj.isNull("lat")) {
            b.addAction(0, "Navighează", navIntent(sosObj.optDouble("lat"), sosObj.optDouble("lng")));
            b.addAction(0, "Deschide", openApp(false, 1, false));
        } else {
            b.addAction(0, "Deschide", openApp(false, 1, false));
        }
        b.addAction(0, "Ieși", leaveIntent());
        return b.build();
    }

    // ------------------------------------------------------------------ utilitare
    private Notification.Builder nb(String ch) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ch) : new Notification.Builder(this);
    }

    private int smallIcon() {
        if (Build.VERSION.SDK_INT >= 24) {
            int id = getResources().getIdentifier("ic_stat_dn", "drawable", getPackageName());
            if (id != 0) return id;
        }
        return android.R.drawable.ic_dialog_map;
    }

    private int pf() { return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0); }

    private PendingIntent openApp(boolean sos, int req, boolean alertScreen) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (sos) i.putExtra("dn_sos", true);
        if (alertScreen) i.putExtra("dn_alert", true);
        return PendingIntent.getActivity(this, req, i, pf());
    }

    private PendingIntent leaveIntent() {
        Intent i = new Intent(this, GameService.class);
        i.setAction(ACTION_LEAVE);
        return PendingIntent.getService(this, 5, i, pf());
    }

    private PendingIntent navIntent(double la, double ln) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + la + "," + ln + "&travelmode=walking"));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(this, 4, i, pf());
    }

    private int battery() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return 0;
            int lv = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            return lv < 0 ? 0 : (int) (lv * 100f / sc);
        } catch (Exception e) { return 0; }
    }

    private static String fmtDist(double m) { return m < 1000 ? String.format(Locale.US, "%.0f m", m) : String.format(Locale.US, "%.2f km", m / 1000.0); }

    private static String compass(double deg) {
        String[] d = {"N", "NE", "E", "SE", "S", "SV", "V", "NV"};
        return d[(int) (Math.round(((deg % 360) + 360) % 360 / 45.0) % 8)];
    }

    private static double hav(double a, double b, double c, double d) {
        double p = Math.toRadians(c - a), q = Math.toRadians(d - b);
        double h = Math.sin(p / 2) * Math.sin(p / 2) + Math.cos(Math.toRadians(a)) * Math.cos(Math.toRadians(c)) * Math.sin(q / 2) * Math.sin(q / 2);
        return 12742000.0 * Math.asin(Math.sqrt(h));
    }

    private static double bearing(double a, double b, double c, double d) {
        double y = Math.sin(Math.toRadians(d - b)) * Math.cos(Math.toRadians(c));
        double x = Math.cos(Math.toRadians(a)) * Math.sin(Math.toRadians(c)) - Math.sin(Math.toRadians(a)) * Math.cos(Math.toRadians(c)) * Math.cos(Math.toRadians(d - b));
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    private void channels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Joc în desfășurare", NotificationManager.IMPORTANCE_LOW);
        live.setShowBadge(false); live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        live.setDescription("Cronometru, rol, poziție și detalii în timpul jocului");
        nm.createNotificationChannel(live);
        NotificationChannel al = new NotificationChannel(CH_ALERT, "Alerte joc", NotificationManager.IMPORTANCE_HIGH);
        al.enableVibration(true); al.setVibrationPattern(new long[]{0, 300, 150, 300, 150, 600});
        al.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        al.setDescription("Seeker aproape, prins, ping, start și sfârșit de rundă");
        nm.createNotificationChannel(al);
        NotificationChannel sos = new NotificationChannel(CH_SOS, "SOS urgență", NotificationManager.IMPORTANCE_HIGH);
        Uri alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarm == null) alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        sos.setSound(alarm, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        sos.enableVibration(true); sos.setVibrationPattern(new long[]{0, 600, 200, 600, 200, 600, 200, 1000});
        sos.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); sos.setBypassDnd(true);
        sos.setDescription("Alertă de urgență când cineva apasă SOS");
        nm.createNotificationChannel(sos);
    }
}
