export function diveOpenWorldPatch(systemId: string) {
  return {
    dossierSystemId: null,
    selectedSystemId: systemId,
    mapFocus: { level: "system" as const, systemId },
    contextMenu: null,
  };
}

export function divePlanetWorldPatch(systemId: string, planetId: string) {
  return {
    dossierSystemId: null,
    mapFocus: { level: "planet" as const, systemId, planetId },
  };
}

export function diveCloseWorldPatch() {
  return {
    dossierSystemId: null,
    mapFocus: { level: "galaxy" as const },
  };
}
