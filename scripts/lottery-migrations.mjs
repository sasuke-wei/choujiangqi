import { readdirSync, readFileSync } from "node:fs";

const directory = new URL("../drizzle/", import.meta.url);
const migrations = readdirSync(directory).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort();

export function migrateLotteryDatabase(connection) {
  const { user_version: version } = connection.prepare("PRAGMA user_version").get();
  for (let index = version; index < migrations.length; index++) {
    connection.exec("BEGIN IMMEDIATE");
    try {
      connection.exec(readFileSync(new URL(migrations[index], directory), "utf8"));
      connection.exec("PRAGMA user_version=" + (index + 1));
      connection.exec("COMMIT");
    } catch (error) {
      connection.exec("ROLLBACK");
      throw error;
    }
  }
}
