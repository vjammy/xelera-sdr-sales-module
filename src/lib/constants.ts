export const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload Leads" },
  { href: "/lists", label: "Lead Lists" },
  { href: "/settings/profile", label: "My Profile" },
  { href: "/admin/products", label: "Products" },
] as const;

export const LOGIN_HINTS = [
  { role: "Sales Manager", email: "ava.manager@xelera.ai", password: "Welcome123!" },
  { role: "Salesperson", email: "leo.rep@xelera.ai", password: "Welcome123!" },
  { role: "Admin Operator", email: "maya.ops@xelera.ai", password: "Welcome123!" },
] as const;
