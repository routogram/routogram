import { Controller, Get } from "@nestjs/common";

type AppInfo = {
  name: string;
  status: "ok";
  endpoints: string[];
};

@Controller()
export class AppController {
  @Get()
  getInfo(): AppInfo {
    return {
      name: "nest-orders",
      status: "ok",
      endpoints: ["POST /orders", "GET /orders", "GET /orders/:id"],
    };
  }

  @Get("health")
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }
}
