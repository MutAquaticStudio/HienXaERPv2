package com.hienxavlxd.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * D86: push notifications of the app through Firebase Cloud Messaging. The website saves this phone's token for the signed-in
 * login (window.HienXaAndroid.pushToken / pushPermission / requestPush, see MainActivity.Bridge); the server sends to it
 * (/api/automation/deliver). A build without the Owner's google-services.json (BuildConfig.PUSH_CONFIGURED false) simply has no
 * push: no token, nothing asked, nothing crashes.
 */
final class Push {
    static final String PREFS = "hien_xa";
    /** The page's event with the phone's token ("" when there is none): window 'hx-push-token'. */
    static final String EVENT = "hx-push-token";
    /** The page to open, as an intent extra; FCM also puts the message's data ("link", "kind", "id") in the extras. */
    static final String EXTRA_LINK = "link";
    static final String TOKEN = "push_token";
    static final String ASKED = "asked_notifications";
    /** Android once offered to explain the notification permission: a later "no explanation" means it is now refused for good. */
    private static final String RATIONALE_SEEN = "notifications_rationale_seen";

    interface TokenCallback {
        void done(String token);
    }

    private Push() {
    }

    static boolean configured(Context context) {
        if (!BuildConfig.PUSH_CONFIGURED) return false;
        try {
            return !FirebaseApp.getApps(context).isEmpty();
        } catch (RuntimeException error) {
            return false;
        }
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The last token Firebase gave this phone, or "". */
    static String token(Context context) {
        return prefs(context).getString(TOKEN, "");
    }

    static void rememberToken(Context context, String token) {
        if (token == null || token.isEmpty() || token.equals(token(context))) return;
        prefs(context).edit().putString(TOKEN, token).apply();
    }

    /** Asks Firebase for the current token (on the main thread when done); the last known one when Firebase cannot answer now. */
    static void fetchToken(Context context, TokenCallback callback) {
        if (!configured(context)) {
            callback.done("");
            return;
        }
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                String fresh = task.isSuccessful() ? task.getResult() : null;
                if (fresh != null && !fresh.isEmpty()) rememberToken(context, fresh);
                callback.done(fresh != null && !fresh.isEmpty() ? fresh : token(context));
            });
        } catch (RuntimeException error) {
            callback.done(token(context));
        }
    }

    /** Android 13+ asks before an app may show notifications; older Android allows them unless switched off in settings. */
    static boolean needsPermission(Context context) {
        return Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
    }

    /** "granted" / "denied" (refused for good, or switched off in settings) / "default" (can still be asked). */
    static String permission(Activity activity) {
        if (!needsPermission(activity)) {
            return NotificationManagerCompat.from(activity).areNotificationsEnabled() ? "granted" : "denied";
        }
        SharedPreferences prefs = prefs(activity);
        if (activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
            prefs.edit().putBoolean(RATIONALE_SEEN, true).apply();
            return "default";
        }
        return prefs.getBoolean(RATIONALE_SEEN, false) ? "denied" : "default";
    }

    /** Called right after Android's answer, while it still tells whether it would ask again. */
    static void noteAnswer(Activity activity) {
        if (Build.VERSION.SDK_INT >= 33 && activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
            prefs(activity).edit().putBoolean(RATIONALE_SEEN, true).apply();
        }
    }

    /** The channel "Thông báo Hiền Xa" (high importance: heads-up and sound). Its id is what the server sends as channel_id. */
    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(context.getString(R.string.push_channel_id),
                context.getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(R.string.push_channel_description));
        manager.createNotificationChannel(channel);
    }

    /** A notification that arrives while the app is open (Android shows the others itself); tapping it opens its page in the app. */
    static void show(Context context, String title, String body, String link, int id) {
        if (needsPermission(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        ensureChannel(context);
        Intent open = new Intent(context, MainActivity.class)
                .putExtra(EXTRA_LINK, link)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, context.getString(R.string.push_channel_id))
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.accent))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_SOUND)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(context).notify(id, notification.build());
        } catch (SecurityException refused) {
            // Permission taken away in between: nothing to show.
        }
    }
}
