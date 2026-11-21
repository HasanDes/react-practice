import { useNavigate } from "react-router-dom";
import { getMe } from "../../../api/index.ts";
import LoadGate from "../../../components/LoadGate.tsx";
import { LoadingState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useRequest } from "../../../hooks/useRequest.ts";
import { useAppDispatch } from "../../../store/store.ts";
import { sessionEnded } from "../sessionSlice.ts";

/**
 * Protected (wrapped in RequireAuth). Loads the profile from GET /api/me
 * instead of trusting the stored copy: if the token has expired, that call
 * gets a 401, the session ends, and RequireAuth sends the user to sign in.
 */
export default function AccountPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { state, retry } = useRequest("me", (signal) => getMe({ signal }));
  useDocumentTitle("Your account");

  function logOut() {
    // Navigate first: if the session ended first, RequireAuth would redirect
    // to the login page instead of the home page.
    navigate("/");
    dispatch(sessionEnded({ reason: "logout" }));
  }

  return (
    <section aria-labelledby="account-heading" className="account">
      <h1 id="account-heading" className="page-heading">
        Your account
      </h1>
      <LoadGate
        state={state}
        onRetry={retry}
        subject="your account"
        loading={<LoadingState label="Loading your account…" variant="detail" />}
      >
        {(user) => (
          <div className="account__card">
            <dl className="order__facts">
              <dt>Name</dt>
              <dd data-testid="account-name">{user.name}</dd>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </dl>
            <button type="button" className="button" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
