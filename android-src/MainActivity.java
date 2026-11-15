package com.deasnuru.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static volatile boolean pendingSos = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveImagePlugin.class);
        registerPlugin(GamePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        handle(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
        try { if (getBridge() != null) getBridge().triggerWindowJSEvent("dn-intent"); } catch (Exception e) { }
    }

    private void handle(Intent i) {
        if (i == null) return;
        if (i.getBooleanExtra("dn_sos", false)) pendingSos = true;
        if (i.getBooleanExtra("dn_alert", false)) {
            // alertă SOS: aprinde ecranul și arată aplicația peste ecranul de blocare
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
            else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        GameService.appVisible = true;
    }

    @Override
    public void onStop() {
        GameService.appVisible = false;
        super.onStop();
    }
}
