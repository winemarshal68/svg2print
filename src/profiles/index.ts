import type { Profile } from '../types';

export const profiles: Profile[] = [
  {
    id: 'logo-sign',
    name: 'Logo / Sign',
    description: 'Thick base with raised lettering or design. Good for wall-mounted signs and logos.',
    defaults: {
      thickness: 3.0,
      baseThickness: 2.0,
      offset: 0.0,
      simplifyTolerance: 0.1,
      removeIslandsThreshold: 0.6,
      bevel: 0.0,
    },
    constraints: {
      thicknessRange: [1.0, 10.0],
      baseThicknessRange: [0.5, 5.0],
      offsetRange: [-2.0, 2.0],
      simplifyToleranceRange: [0.01, 1.0],
      bevelRange: [0.0, 2.0],
    },
  },
  {
    id: 'cookie-cutter',
    name: 'Cookie Cutter',
    description: 'Thin wall outline, no base. Sharp cutting edge for cookies and clay.',
    defaults: {
      thickness: 12.0, // tall enough for grip
      baseThickness: 0.0, // no base - just the outline
      offset: 0.5, // outward expansion for cutting edge
      simplifyTolerance: 0.2,
      removeIslandsThreshold: 2.0, // remove small details
      bevel: 0.0,
    },
    constraints: {
      thicknessRange: [8.0, 20.0],
      baseThicknessRange: [0.0, 2.0],
      offsetRange: [0.0, 3.0],
      simplifyToleranceRange: [0.1, 1.0],
      bevelRange: [0.0, 1.0],
    },
  },
  {
    id: 'stamp',
    name: 'Stamp',
    description: 'Thick base with shallow inverted relief. For ink stamps and embossing.',
    defaults: {
      thickness: 1.5, // shallow relief
      baseThickness: 8.0, // thick handle
      offset: -0.2, // slight inward offset for crisp edges
      simplifyTolerance: 0.05,
      removeIslandsThreshold: 0.3,
      bevel: 0.0,
    },
    constraints: {
      thicknessRange: [0.5, 3.0],
      baseThicknessRange: [5.0, 15.0],
      offsetRange: [-1.0, 1.0],
      simplifyToleranceRange: [0.01, 0.5],
      bevelRange: [0.0, 1.0],
    },
  },
  {
    id: 'keychain',
    name: 'Keychain',
    description: 'Moderate thickness with small base. Includes hole for keyring.',
    defaults: {
      thickness: 2.0,
      baseThickness: 1.0,
      offset: 0.0,
      simplifyTolerance: 0.1,
      removeIslandsThreshold: 0.5,
      bevel: 0.3, // slight bevel for comfort
    },
    constraints: {
      thicknessRange: [1.5, 4.0],
      baseThicknessRange: [0.5, 2.0],
      offsetRange: [-1.0, 1.0],
      simplifyToleranceRange: [0.05, 0.5],
      bevelRange: [0.0, 1.0],
    },
  },
];

export function getProfile(id: string): Profile | undefined {
  return profiles.find((p) => p.id === id);
}
