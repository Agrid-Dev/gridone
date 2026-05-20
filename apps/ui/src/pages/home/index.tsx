import { FC } from "react";
import { isFeatureEnabled } from "@/utils/featureFlags";
import { Navigate } from "react-router";
const Home: FC = () => {
  const homeEnabled = isFeatureEnabled("buildingHomepage");
  if (!homeEnabled) {
    return <Navigate to="/devices" replace />;
  }

  return <h1>Home page de la maison 🏠</h1>;
};

export default Home;
