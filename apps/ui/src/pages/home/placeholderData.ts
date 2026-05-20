export type BuildingPlaceholderData = {
  name: string;
  type: string;
  address: string;
  surface: number;
  floors: number;
  yearBuilt: number;
  operator: string;
  latitude: number;
  longitude: number;
  coverUrl: string;
};

export const buildingPlaceholderData: BuildingPlaceholderData = {
  name: "Mercure Opéra Garnier",
  type: "Hôtel",
  address: "4 Rue de l'Isly, 75008 Paris",
  surface: 3126,
  floors: 7,
  yearBuilt: 1986,
  operator: "Accor Hotels",
  latitude: 48.8749511,
  longitude: 2.3259532,
  coverUrl:
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/867615793.jpg?k=9a4b30f32cf99ec37d30bf96e382c854ee81d4a9789213b5a9e2f8920b9f3dbc&o=",
};
