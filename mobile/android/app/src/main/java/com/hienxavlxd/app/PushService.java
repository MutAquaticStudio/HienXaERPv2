package com.hienxavlxd.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * D86: Firebase hands this app its messages and token here. While the app is in the background Android shows the notification
 * itself (channel "Thông báo Hiền Xa", icon ic_notification, see the manifest) and a tap opens MainActivity with the message's
 * "link"; while the app is open it arrives in onMessageReceived and is shown the same way. A new token is remembered, and the
 * open page hears about it (MainActivity listens to the saved token), so the login keeps receiving.
 */
public class PushService extends FirebaseMessagingService {
    @Override
    public void onCreate() {
        super.onCreate();
        // Before Firebase shows a background notification on this channel.
        Push.ensureChannel(this);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Push.rememberToken(this, token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        RemoteMessage.Notification shown = message.getNotification();
        Map<String, String> data = message.getData();
        String title = shown != null && shown.getTitle() != null ? shown.getTitle() : data.get("title");
        if (title == null || title.isEmpty()) return;
        String body = shown != null && shown.getBody() != null ? shown.getBody() : data.get("body");
        String id = data.get("id");
        int notificationId = (id != null ? id : String.valueOf(message.getSentTime())).hashCode();
        Push.show(this, title, body == null ? "" : body, data.get(Push.EXTRA_LINK), notificationId);
        // D92: the open screen refreshes at once (new jobs, counts, the announcement popup) without a tap.
        MainActivity.pushArrived(data.get("kind"), id);
    }
}
