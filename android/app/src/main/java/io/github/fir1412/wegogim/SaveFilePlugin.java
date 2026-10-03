package io.github.fir1412.wegogim;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Android Save as: reports completion only after the selected document has been written. */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    private byte[] pending;
    @PluginMethod public synchronized void save(PluginCall call) {
        if (pending != null) { call.reject("Another save is already open"); return; }
        String data = call.getString("data", "");
        if (data.length() > 44739244) { call.reject("File exceeds 32 MB"); return; }
        try {
            pending = Base64.decode(data, Base64.DEFAULT);
            if (pending.length > 32 * 1024 * 1024) { pending = null; call.reject("File exceeds 32 MB"); return; }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(call.getString("mime", "application/octet-stream"));
            intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "export"));
            startActivityForResult(call, intent, "saved");
        } catch (Exception error) { pending = null; call.reject("Could not open Save as", error); }
    }
    @ActivityCallback private synchronized void saved(PluginCall call, ActivityResult result) {
        byte[] bytes = pending; pending = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value); return;
        }
        if (bytes == null || result.getData() == null || result.getData().getData() == null) {
            call.reject("Save was interrupted. Please try again."); return;
        }
        getBridge().execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                if (out == null) throw new IllegalStateException("No output stream");
                out.write(bytes); out.flush();
                JSObject value = new JSObject(); value.put("cancelled", false); call.resolve(value);
            } catch (Exception error) { call.reject("Could not save file", error); }
        });
    }
}
