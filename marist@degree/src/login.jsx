import { useState } from "react";
import { login } from "./api";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await login(email, password);
      onLogin(session.profile);
    } catch (err) {
      setError(
        err.status === 401
          ? "Invalid email or password"
          : "Can't reach the server. Is the backend running?",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <div className="login-header text-center">
        <h1 className="text-2xl text-red-700 font-bold">Marist SmartDegree</h1>
        <p className="flex flex-wrap justify-center">
          <span className="text-red-700 pl-1 pr-1 font-bold">Graduate</span>{" "}
          smarter.
          <span className="text-red-700 pl-1 pr-1 font-bold">Plan</span> Faster.
          <span className="text-red-700 pl-1 pr-1 font-bold">Track</span> degree
          progress.
          <span className="text-red-700 pl-1 pr-1 font-bold">Build</span>{" "}
          optimal schedule
        </p>
      </div>

      <form className="flex flex-col gap-1 w-xs" onSubmit={handleSubmit}>
        <label htmlFor="email" className="block">
          Email
        </label>
        <input
          type="email"
          name="email"
          id="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-sm p-1 w-full"
        />

        <label htmlFor="student-password" className="block mt-2">
          Password
        </label>
        <input
          type="password"
          name="password"
          id="student-password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded-sm p-1 w-full"
        />

        {error && (
          <p role="alert" className="text-red-700 text-sm mt-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold rounded-sm p-2 w-full cursor-pointer"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
