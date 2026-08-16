export function pendingOrderCount(
  orders: { status: string }[] | undefined | null,
): number {
  return orders?.filter((o) => o.status === "pending").length ?? 0;
}
