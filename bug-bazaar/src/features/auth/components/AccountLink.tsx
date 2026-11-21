import { Link, useLocation } from "react-router-dom";
import { UserIcon } from "../../../components/icons.tsx";
import { useAppSelector } from "../../../store/store.ts";
import { loginHref } from "../returnTo.ts";
import { selectUser } from "../sessionSlice.ts";

/** Header link: "Account" when signed in, otherwise "Sign in" (coming back here afterwards). */
export default function AccountLink() {
  const user = useAppSelector(selectUser);
  const location = useLocation();

  if (user) {
    return (
      <Link to="/account" className="nav-link" aria-label={`Account, signed in as ${user.name}`}>
        <UserIcon className="nav-link__icon" />
        {user.name}
      </Link>
    );
  }
  return (
    <Link to={loginHref(location)} className="nav-link">
      Sign in
    </Link>
  );
}
