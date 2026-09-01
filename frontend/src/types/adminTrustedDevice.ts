export type AdminTrustedDevice = {
  id: string;
  label: string;
  current: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AdminTrustedDeviceList = {
  devices: AdminTrustedDevice[];
};
