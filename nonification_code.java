Intent intent = new Intent(context, EmergencyAlertActivity.class);
PendingIntent fullScreenIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT);
Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_alert)
        .setContentTitle("Emergency Vehicle Approaching")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setFullScreenIntent(fullScreenIntent, true)
        .build();
notificationManager.notify(911, notification);
context.startActivity(intent);