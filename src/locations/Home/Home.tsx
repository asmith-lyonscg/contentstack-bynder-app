import { Link } from "react-router-dom";
import { publicAsset } from "../../lib/appBase";
import "./Home.css";

export default function Home() {
  return (
    <div className="home">
      <img src={publicAsset("app-icon.svg")} alt="" width={48} height={48} />
      <h1>Bynder Image Settings</h1>
      <p>
        Contentstack Marketplace app. Contentstack loads this app at a UI location path, not the site
        root.
      </p>
      <ul>
        <li>
          Custom Field: <code>/custom-field</code>
        </li>
        <li>
          App Configuration: <code>/app-configuration</code>
        </li>
      </ul>
      <p>
        Local routes: <Link to="/custom-field">Custom Field</Link> ·{" "}
        <Link to="/app-configuration">App Config</Link>
      </p>
    </div>
  );
}
