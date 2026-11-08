import { ActivationForm } from '../components/ActivationForm';

export default function ActivatePage() {
  return <main className="auth-page"><section className="auth-card"><div className="auth-form-side"><div className="auth-form-card">
    <h1>Activate tenant account</h1><p>Complete your approved access request.</p><ActivationForm />
  </div></div></section></main>;
}
