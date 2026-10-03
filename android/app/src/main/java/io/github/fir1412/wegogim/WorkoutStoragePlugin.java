package io.github.fir1412.wegogim;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Set;

/** Authoritative app-private storage. Never uses the WebView or cache directory. */
@CapacitorPlugin(name = "WorkoutStorage")
public class WorkoutStoragePlugin extends Plugin {
    private SQLiteDatabase database;
    private static final Set<String> STORES = Set.of("sessions", "exercises", "body", "cardio", "kv");
    private SQLiteDatabase db() {
        if (database == null) {
            database = getContext().openOrCreateDatabase("workouts.sqlite", 0, null);
            database.execSQL("PRAGMA synchronous=FULL");
            database.execSQL("CREATE TABLE IF NOT EXISTS records (store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(store,key))");
            database.execSQL("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        }
        return database;
    }
    private String store(PluginCall call) {
        String value = call.getString("store", "");
        if (!STORES.contains(value)) throw new IllegalArgumentException("Invalid store");
        return value;
    }
    private boolean migrated(SQLiteDatabase d) {
        try (Cursor c = d.rawQuery("SELECT value FROM metadata WHERE key='webview-migrated'", null)) { return c.moveToFirst(); }
    }
    private void put(SQLiteDatabase d, String store, JSONObject record) throws Exception {
        Object key = record.get(store.equals("kv") ? "key" : "id");
        if (!(key instanceof String) || ((String) key).isEmpty()) throw new IllegalArgumentException("Invalid record key");
        ContentValues values = new ContentValues();
        values.put("store", store); values.put("key", (String) key); values.put("value", record.toString());
        if (d.insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE) < 0) throw new IllegalStateException("Save failed");
    }
    @PluginMethod public synchronized void init(PluginCall call) {
        try { JSObject result = new JSObject(); result.put("migrated", migrated(db())); call.resolve(result); }
        catch (Exception e) { call.reject("Could not open workout database", e); }
    }
    /** Copies existing WebView records once; transaction and marker commit together. Leaves source intact. */
    @PluginMethod public synchronized void migrate(PluginCall call) {
        SQLiteDatabase d = null;
        try {
            d = db(); d.beginTransaction();
            if (!migrated(d)) {
                JSObject stores = call.getObject("stores");
                if (stores == null) throw new IllegalArgumentException("Missing migration records");
                for (String store : STORES) {
                    JSONArray list = stores.getJSONArray(store);
                    for (int i = 0; i < list.length(); i++) put(d, store, list.getJSONObject(i));
                }
                d.execSQL("INSERT INTO metadata(key,value) VALUES ('webview-migrated','1')");
            }
            d.setTransactionSuccessful(); d.endTransaction(); d = null; call.resolve();
        } catch (Exception e) { if (d != null && d.inTransaction()) d.endTransaction(); call.reject("Workout migration failed; original data was retained", e); }
    }
    @PluginMethod public synchronized void read(PluginCall call) {
        try {
            String store = store(call), key = call.getString("key");
            JSArray records = new JSArray();
            String sql = "SELECT value FROM records WHERE store=?" + (key == null ? "" : " AND key=?") + " ORDER BY key";
            try (Cursor c = db().rawQuery(sql, key == null ? new String[]{store} : new String[]{store, key})) {
                while (c.moveToNext()) records.put(new JSONObject(c.getString(0)));
            }
            JSObject result = new JSObject(); result.put("records", records); call.resolve(result);
        } catch (Exception e) { call.reject("Could not read workout data", e); }
    }
    @PluginMethod public synchronized void keys(PluginCall call) {
        try {
            JSArray keys = new JSArray(); String prefix = call.getString("prefix", "");
            try (Cursor c = db().rawQuery("SELECT key FROM records WHERE store='kv' ORDER BY key", null)) {
                while (c.moveToNext()) if (c.getString(0).startsWith(prefix)) keys.put(c.getString(0));
            }
            JSObject result = new JSObject(); result.put("keys", keys); call.resolve(result);
        } catch (Exception e) { call.reject("Could not read workout keys", e); }
    }
    @PluginMethod public synchronized void write(PluginCall call) {
        SQLiteDatabase d = null;
        try {
            String store = store(call), operation = call.getString("operation", "put");
            d = db(); d.beginTransaction();
            if (operation.equals("clear")) d.delete("records", "store=?", new String[]{store});
            else if (operation.equals("delete")) {
                String key = call.getString("key");
                if (key == null) throw new IllegalArgumentException("Missing key");
                d.delete("records", "store=? AND key=?", new String[]{store, key});
            } else if (operation.equals("put")) {
                JSArray list = call.getArray("records");
                if (list == null) throw new IllegalArgumentException("Missing records");
                for (int i = 0; i < list.length(); i++) put(d, store, list.getJSONObject(i));
            } else throw new IllegalArgumentException("Invalid operation");
            d.setTransactionSuccessful(); d.endTransaction(); d = null; call.resolve();
        } catch (Exception e) { if (d != null && d.inTransaction()) d.endTransaction(); call.reject("Could not save workout data", e); }
    }
}
