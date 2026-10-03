package io.github.fir1412.wegogim;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(state);
    }
}
