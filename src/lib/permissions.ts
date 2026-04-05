import { UserRole } from "@prisma/client";

export function canManageProducts(role: UserRole) {
  return role === "admin_operator" || role === "sales_manager";
}

export function canManageUsers(role: UserRole) {
  return role === "admin_operator" || role === "sales_manager";
}

export function canBulkApprove(role: UserRole) {
  return role === "sales_manager";
}

export function canViewAllWork(role: UserRole) {
  return role !== "salesperson";
}
