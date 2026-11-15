package com.deasnuru.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Game")
public class GamePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(c, GameService.class);
        i.putExtra("api", call.getString("api", ""));
        i.putExtra("code", call.getString("code", ""));
        i.putExtra("user", call.getString("user", ""));
        i.putExtra("tok", call.getString("tok", ""));
        i.putExtra("name", call.getString("name", ""));
        try {
            ContextCompat.startForegroundService(c, i);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
            return;
        }
        askPermissions();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try { getContext().stopService(new Intent(getContext(), GameService.class)); } catch (Exception e) { }
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        try { getContext().stopService(new Intent(getContext(), GameService.class)); } catch (Exception e) { }
        call.resolve();
        if (getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
                @Override public void run() { try { getActivity().finishAndRemoveTask(); } catch (Exception e) { } }
            });
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("no url"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sos", MainActivity.pendingSos);
        MainActivity.pendingSos = false;
        call.resolve(r);
    }

    /** Notificări (Android 13+) și excepție de la optimizarea bateriei – cerute o singură dată, pe rând. */
    private void askPermissions() {
        final Context c = getContext();
        if (getActivity() == null) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            getActivity().runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.POST_NOTIFICATIONS"}, 7421); } catch (Exception e) { }
                }
            });
            return;
        }
        if (Build.VERSION.SDK_INT >= 23) {
            final SharedPreferences sp = c.getSharedPreferences("dn", Context.MODE_PRIVATE);
            try {
                PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                if (!sp.getBoolean("battery_asked", false) && !pm.isIgnoringBatteryOptimizations(c.getPackageName())) {
                    sp.edit().putBoolean("battery_asked", true).apply();
                    getActivity().runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
                                getActivity().startActivity(i);
                            } catch (Exception e) { }
                        }
                    });
                }
            } catch (Exception e) { }
        }
    }
}
