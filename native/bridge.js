import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

const SaveFile = registerPlugin('SaveFile');
const WorkoutStorage = registerPlugin('WorkoutStorage');
const MAX = 32 * 1024 * 1024;
async function encode(blob) {
  if (blob.size > MAX) throw Error('File exceeds the 32 MB Android export limit.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
const safeName = name => String(name).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120) || 'export';
let shareBusy = false;
let notificationQueue = Promise.resolve();
let requestedRest = '';
let requestedTraining = '';
let trainingQueue = Promise.resolve();

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.native = 'android';
  const dir = 'gim-shares';
  await Filesystem.mkdir({ path: dir, directory: Directory.Cache, recursive: true }).catch(() => {});
  // Recipients may read after the chooser closes. Retain shares for 24 hours.
  const old = await Filesystem.readdir({ path: dir, directory: Directory.Cache }).catch(() => ({ files: [] }));
  for (const file of old.files) if (file.type === 'file' && file.mtime < Date.now() - 86400000)
    await Filesystem.deleteFile({ path: `${dir}/${file.name}`, directory: Directory.Cache }).catch(() => {});
  await LocalNotifications.createChannel({ id: 'rest', name: 'Rest timer', importance: 5, visibility: 1, vibration: true });
  await LocalNotifications.createChannel({ id: 'training', name: 'Workout reminders', importance: 3, visibility: 0 });
  await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => { location.hash = notification.id === 1 ? '#/workout' : '#/today'; });
  window.gimNative = {
    storage: WorkoutStorage,
    async shareText(text) {
      try { await Share.share({ title: 'we go gim', text }); }
      catch (error) { if (/share cancel/i.test(error.message)) throw new DOMException('Share cancelled', 'AbortError'); throw error; }
    },
    async trainingPermission(enabled) {
      if (enabled && (await LocalNotifications.requestPermissions()).display !== 'granted') return false;
      await WorkoutStorage.write({ store: 'kv', records: [{ key: 'native-training-opt-in', value: !!enabled }] });
      requestedTraining = '';
      return true;
    },
    trainingNotifications(items) {
      const key = JSON.stringify(items);
      if (key === requestedTraining) return trainingQueue;
      requestedTraining = key;
      trainingQueue = trainingQueue.catch(() => {}).then(async () => {
        await LocalNotifications.cancel({ notifications: Array.from({ length: 28 }, (_, i) => ({ id: 2000 + i })) });
        const consent = (await WorkoutStorage.read({ store: 'kv', key: 'native-training-opt-in' })).records[0]?.value;
        if (!consent || !items.length || (await LocalNotifications.checkPermissions()).display !== 'granted') return;
        await LocalNotifications.schedule({ notifications: items.filter(n => n.at > Date.now()).map(n => ({ id: n.id, title: 'we go gim', body: n.body, channelId: 'training', schedule: { at: new Date(n.at) } })) });
      });
      return trainingQueue.catch(error => { requestedTraining = ''; throw error; });
    },
    async save(name, blob) {
      const result = await SaveFile.save({ name: safeName(name), mime: blob.type || 'application/octet-stream', data: await encode(blob) });
      if (result.cancelled) throw new DOMException('Save cancelled', 'AbortError');
      return true;
    },
    async share(name, blob, text) {
      if (shareBusy) throw Error('Another share is already open.');
      shareBusy = true;
      try {
      const files = await Filesystem.readdir({ path: dir, directory: Directory.Cache });
      if (files.files.length >= 64 || files.files.reduce((n, f) => n + (f.size || 0), 0) + blob.size > 96 * 1024 * 1024)
        throw Error('Share cache is full. Try Save to phone.');
      const path = `${dir}/${crypto.randomUUID()}-${safeName(name)}`;
      const { uri } = await Filesystem.writeFile({ path, directory: Directory.Cache, data: await encode(blob) });
      try { await Share.share({ files: [uri], title: 'we go gim', text }); }
      catch (error) {
        await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
        if (/share cancel/i.test(error.message)) throw new DOMException('Share cancelled', 'AbortError');
        throw error;
      }
      return true;
      } finally { shareBusy = false; }
    },
    async notificationPermission() {
      const granted = (await LocalNotifications.requestPermissions()).display === 'granted';
      if (granted && (await LocalNotifications.checkExactNotificationSetting()).exact_alarm !== 'granted') {
        // User-controlled special access; never use the restricted USE_EXACT_ALARM permission.
        await LocalNotifications.changeExactNotificationSetting();
      }
      return granted;
    },
    restNotification(timer, enabled) {
      const end = timer?.end, label = timer?.label;
      const key = enabled && end ? `${end}|${label}` : '';
      if (key === requestedRest) return notificationQueue;
      requestedRest = key;
      notificationQueue = notificationQueue.catch(() => {}).then(async () => {
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
      if (!end || !enabled || end <= Date.now()) return;
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
      await LocalNotifications.schedule({ notifications: [{ id: 1, channelId: 'rest', title: 'Rest done. Next set.', body: label || 'Ready for the next set?', schedule: { at: new Date(end), allowWhileIdle: true } }] });
      });
      return notificationQueue.catch(error => { requestedRest = ''; throw error; });
    }
  };
  await App.addListener('backButton', () => {
    if (history.state?.sheet || (history.state?.i ?? 0) > 0) history.back();
    else App.minimizeApp();
  });
  await App.addListener('appStateChange', ({ isActive }) => {
    document.dispatchEvent(new Event('visibilitychange'));
    if (isActive) window.dispatchEvent(new Event('focus'));
  });
  document.addEventListener('click', async event => {
    const a = event.target.closest('a[download]');
    if (!a) return;
    event.preventDefault();
    try { await window.gimNative.save(a.download, await (await fetch(a.href)).blob()); }
    catch (error) { if (error.name !== 'AbortError') alert(error.message); }
  });
}
