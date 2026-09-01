export type AdminTrustedDeviceDto = {
  id: string;
  label: string;
  current: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AdminTrustedDeviceListDto = {
  devices: AdminTrustedDeviceDto[];
};
