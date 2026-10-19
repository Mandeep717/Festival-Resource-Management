export function conflictIdentity(conflict) {
  const sessionIds = (conflict.sessionIds || [])
    .map(String)
    .sort();

  const venueIds = (conflict.venueIds || [])
    .map(String)
    .sort();

  const resourceAllocations = (conflict.resourcesAllocated || [])
    .map((allocation) => ({
      resourceId: String(allocation.resourceId),
      quantity: Number(allocation.quantity),
    }))
    .sort((a, b) =>
      a.resourceId.localeCompare(b.resourceId) ||
      a.quantity - b.quantity
    );

  return JSON.stringify({
    conflictType: conflict.conflictType,
    sessionIds,
    venueIds,
    resourceAllocations,
  });
}
