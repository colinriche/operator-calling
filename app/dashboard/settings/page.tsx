import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">Account and app settings.</p>

      <div className="space-y-4">
        {[
          { label: "Change password", desc: "Update your account password." },
          { label: "Delete account", desc: "Permanently delete your account and data.", danger: true },
        ].map((item) => (
          <div key={item.label} className={`bg-card rounded-2xl p-5 border flex items-center justify-between ${item.danger ? "border-destructive/30" : "border-border/60"}`}>
            <div>
              <p className={`font-semibold text-sm ${item.danger ? "text-destructive" : "text-foreground"}`}>{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <button className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${item.danger ? "border-destructive/40 text-destructive hover:bg-destructive/10" : "border-border hover:bg-muted"}`}>
              {item.danger ? "Delete" : "Change"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
