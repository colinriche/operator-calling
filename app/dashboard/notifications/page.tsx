import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications" };

const notifications = [
  { text: "Priya N. accepted your callback request", time: "2h ago", read: false, icon: "📞" },
  { text: "You have a scheduled call with Sarah K. in 1 hour", time: "3h ago", read: false, icon: "🔔" },
  { text: "New member joined Running Club: Jordan W.", time: "Yesterday", read: true, icon: "👤" },
  { text: "Your call with Marcus T. was completed — 8 minutes", time: "Yesterday", read: true, icon: "✅" },
  { text: "You missed a scheduled call with Priya N.", time: "Last Friday", read: true, icon: "⚠️" },
];

export default function NotificationsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Notifications</h1>
      <p className="text-muted-foreground mb-8">Stay on top of your calls and activity.</p>

      <div className="space-y-2">
        {notifications.map((n, i) => (
          <div
            key={i}
            className={`bg-card rounded-xl p-4 border flex items-start gap-3 transition-colors ${
              n.read ? "border-border/40" : "border-primary/20 bg-primary/3"
            }`}
          >
            <span className="text-xl shrink-0">{n.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-foreground">{n.text}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{n.time}</p>
            </div>
            {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
