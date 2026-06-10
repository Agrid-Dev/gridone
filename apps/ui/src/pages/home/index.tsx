import { FC } from "react";
import { useBuildingProfile } from "@/hooks/useBuildingProfile";
import { BuildingSilhouette } from "@/components/BuildingSilhouette";
import { ProfileHero } from "./ProfileHero";
import { ResourceLinks } from "./ResourceLinks";

const Home: FC = () => {
  const { data: profile, isLoading: profileLoading } = useBuildingProfile();

  return (
    <section className="relative isolate space-y-10">
      <BuildingSilhouette className="fixed inset-2 -z-10" />
      <ProfileHero profile={profile} loading={profileLoading} />
      <ResourceLinks />
    </section>
  );
};

export default Home;
