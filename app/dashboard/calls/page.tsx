import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calls" };

const calls = [
  { name: "Sarah K.", date: "Today, 3:00 PM", duration: null, type: "Scheduled", status: "upcoming" },
  { name: "Marcus T.", date: "Yesterday, 11:30 AM", duration: "8 min", type: "Callback", status: "completed" },
  { name: "Running Club", date: "Mon, 7:30 AM", duration: "12 min", type: "Group", status: "completed" },
  { name: "Priya N.", date: "Last Friday, 4:00 PM", duration: null, type: "Scheduled", status: "missed" },
];

const statusColor: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-800",
};

export default function CallsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Calls</h1>
      <p className="text-muted-foreground mb-8">Upcoming, completed, and missed calls.</p>

      <div className="space-y-3">
        {calls.map((call, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-sm shrink-0">
              {call.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{call.name}</p>
              <p className="text-xs text-muted-foreground">{call.date}{call.duration ? ` · ${call.duration}` : ""}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">{call.type}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[call.status]}`}>
                {call.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
