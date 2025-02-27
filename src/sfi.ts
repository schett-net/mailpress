import {
  Context,
  decorator,
  defineService,
  withContext,
} from "@snek-at/function";
import {
  AuthenticationContext,
  AuthenticationRequiredError,
  requireAnyAuth,
} from "@snek-functions/jwt";
import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { EmailEngine } from "./email-engine";
import {
  EmailEnvelope,
  EmailTemplateFactory,
  TemplateVariableValues,
} from "./email-template-factory";
import { requireAdminOnMailpress } from "./decorators";

dotenv.config();

const optionalAnyAuth = decorator(async (context, args) => {
  let ctx: Context<{
    auth?: AuthenticationContext["auth"];
    multiAuth?: AuthenticationContext["multiAuth"];
  }> = context;

  try {
    ctx = await requireAnyAuth(context, args);
  } catch (e) {
    if (!(e instanceof AuthenticationRequiredError)) {
      throw e;
    }
  }

  return ctx;
});

export default defineService(
  {
    Query: {
      template: withContext(() => EmailTemplateFactory.getTemplate, {
        decorators: [requireAdminOnMailpress],
      }),
      allTemplate: withContext(() => EmailTemplateFactory.getTemplates, {
        decorators: [requireAdminOnMailpress],
      }),
    },
    Mutation: {
      mailSchedule: withContext(
        (context) =>
          async (
            envelope: EmailEnvelope,
            body?: string,
            bodyHTML?: string,
            template?: {
              id: string;
              values?: TemplateVariableValues;
            }
          ) => {
            const originUserId = context.multiAuth?.[0].userId;

            const emailTemplate = template?.id
              ? EmailTemplateFactory.getTemplate(template?.id)
              : undefined;

            const engine = new EmailEngine({
              template: emailTemplate,
              authorizationUser: originUserId
                ? {
                    id: originUserId,
                    authorization: context.req.headers.authorization!,
                  }
                : undefined,
            });

            return await engine.scheduleMail({
              envelope,
              body,
              bodyHTML,
              values: template?.values,
            });
          },
        {
          decorators: [optionalAnyAuth],
        }
      ),
      createTemplate: EmailTemplateFactory.createTemplate,
    },
  },
  {
    configureApp: () => {
      import("./init-templates");
    },
  }
);
