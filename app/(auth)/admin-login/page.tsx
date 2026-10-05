import { redirect } from "next/navigation";

// The passwordless admin login is retired (see app/api/admin/token). Admins sign in
// with a real credential at /login; their role comes from the `admins` collection.
export default function AdminLoginPage() {
  redirect("/login?next=/admin");
}
