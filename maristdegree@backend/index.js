import e from "express";
import cors from "cors";
import "dotenv/config";

const app = e();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(e.json());

app.get("/", (req, res) => {
  res.json({ message: "Server up and running" });
});

app.listen(PORT, () => {
  console.log(`Server running at localhost:${PORT}`);
});
