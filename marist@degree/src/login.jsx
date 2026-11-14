export default function Login() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <div className="login-header text-center">
        <h1 className="text-2xl text-red-700 font-bold">Marist SmartDegree</h1>
        <p className="flex flex-wrap justify-center">
          <span className="text-red-700 pl-1 pr-1 font-bold">Graduate</span>{" "}
          smarter.
          <span className="text-red-700 pl-1 pr-1 font-bold">Plan</span>{" "}
          Faster.
          <span className="text-red-700 pl-1 pr-1 font-bold">Track</span>{" "}
          degree progress.
          <span className="text-red-700 pl-1 pr-1 font-bold">Build</span>{" "}
          optimal schedule
        </p>
      </div>

      <form
        className="flex flex-col gap-1 w-xs"
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor="student-email" className="block">
          Student Email
        </label>
        <input
          type="email"
          name="email"
          id="student-email"
          className="border rounded-sm p-1 w-full"
        />

        <label htmlFor="student-password" className="block mt-2">
          Password
        </label>
        <input
          type="password"
          name="password"
          id="student-password"
          className="border rounded-sm p-1 w-full"
        />

        <button
          type="submit"
          className="mt-4 bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm p-2 w-full cursor-pointer"
        >
          Login
        </button>
      </form>
    </div>
  );
}
