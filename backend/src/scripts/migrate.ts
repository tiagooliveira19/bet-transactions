import { MikroORM } from "@mikro-orm/postgresql";
import config from "../mikro-orm.config";

const direction = process.argv[2] ?? "up";

const orm = await MikroORM.init(config);
const migrator = orm.getMigrator();

try {
  if (direction === "down") {
    await migrator.down();
  } else {
    await migrator.up();
  }
} finally {
  await orm.close(true);
}
