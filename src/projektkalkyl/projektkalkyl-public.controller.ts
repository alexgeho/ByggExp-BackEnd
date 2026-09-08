import { Body, Controller, Get, Param, Post, Sse, MessageEvent } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { filter, mergeMap, map, startWith } from "rxjs/operators";
import { Public } from "../common/decorators/public.decorator";
import { ProjektkalkylService } from "./projektkalkyl.service";

// Public, unauthenticated read-only access to a shared calculation via its
// share token. No class guards here (unlike ProjektkalkylController) so the
// global JwtAuthGuard is opted out via @Public().
@Public()
@Controller("projektkalkyl-public")
export class ProjektkalkylPublicController {
  constructor(private readonly service: ProjektkalkylService) {}

  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.service.findByShareToken(token);
  }

  @Post(":token/comments")
  addGuestComment(
    @Param("token") token: string,
    @Body() body: { text?: string; authorName?: string },
  ) {
    return this.service.addGuestComment(token, body?.authorName, body?.text);
  }

  // Instant live: SSE stream that pushes a fresh read-only snapshot whenever the
  // owner saves (autosave) or someone comments. Client falls back to polling.
  @Sse(":token/stream")
  async stream(@Param("token") token: string): Promise<Observable<MessageEvent>> {
    const id = await this.service.resolveShareId(token); // throws if invalid/expired
    return this.service.changes$.pipe(
      filter((changedId) => changedId === id),
      startWith("__init__"),
      mergeMap(() => from(this.service.findByShareToken(token))),
      map((snapshot) => ({ data: snapshot } as MessageEvent)),
    );
  }
}
