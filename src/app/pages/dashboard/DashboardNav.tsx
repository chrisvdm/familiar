import { FamiliarMark } from "@/app/components/familiar-mark";

const DashboardNav = () => (
  <nav className="dashboard-nav" aria-label="Primary">
    <a className="dashboard-nav-brand" href="/" aria-label="familiar home">
      <FamiliarMark className="dashboard-nav-logo" />
      <span className="dashboard-nav-title">Dashboard</span>
    </a>
  </nav>
);

export default DashboardNav;
