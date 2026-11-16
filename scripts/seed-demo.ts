import path from "node:path";

const dbPath =
  process.env.MAYA_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "demo.db");
const force = process.argv.includes("--force");
const useModel = process.argv.includes("--model");

if (!dbPath.includes("demo") && !force) {
  console.error(
    `Refusing to seed ${dbPath}. Use a path containing "demo", or pass --force.`,
  );
  process.exit(1);
}

process.env.MAYA_DB_PATH = dbPath;

const samples = [
  {
    text: "okay so i think we should just go on friday. it's kind of far but the train is easy. lmk what you think",
    genre: "message" as const,
    audience: "friend" as const,
  },
  {
    text: "honestly that meeting could have been an email. i'll send the notes later tonight",
    genre: "message" as const,
    audience: "colleague" as const,
  },
  {
    text: "i'm not sure about the blue one. the green feels more like me? but idk",
    genre: "message" as const,
    audience: "friend" as const,
  },
  {
    text: "we got the apartment!! okay deep breath. i'll call you after work",
    genre: "message" as const,
    audience: "family" as const,
  },
  {
    text: "tbh i skimmed it. the part about pricing is the only bit that felt new",
    genre: "message" as const,
    audience: "colleague" as const,
  },
  {
    text: "hey — did you ever hear back from the landlord? no rush, just checking",
    genre: "message" as const,
    audience: "friend" as const,
  },
  {
    text: "Hi Sam,\n\nThanks for sending this over. I had a look this morning and the structure is mostly there. I'd move the pricing section earlier, before the case study, because that's the question everyone asks first.\n\nI can send a marked-up version tomorrow.\n\nBest,\nMaya",
    genre: "email" as const,
    audience: "colleague" as const,
  },
  {
    text: "Hi Priya,\n\nQuick update: the venue is confirmed for the 14th, and they can hold the room until 6. I've asked about the projector but haven't heard back yet.\n\nI'll chase it on Monday.\n\nThanks,\nMaya",
    genre: "email" as const,
    audience: "client" as const,
  },
  {
    text: "Hello,\n\nI'm writing to ask whether the deadline can move to the 21st. We lost two days to the data issue, and I'd rather send something accurate than something fast.\n\nLet me know if that works.\n\nThanks,\nMaya",
    genre: "email" as const,
    audience: "client" as const,
  },
  {
    text: "The first time I used the library's microfilm machine, I was looking for a building that no longer exists. The librarian found the reel in a drawer marked with a strip of masking tape, and we wound it through the machine together. Ten minutes later, the street appeared: same curve, same trees, a tram that stopped running before either of us was born. I remember being surprised that the past looked so ordinary. It was just a street, with people on it, going somewhere.",
    genre: "essay" as const,
    audience: "public" as const,
  },
  {
    text: "There is a particular kind of tiredness that comes from reading your own draft for the fourth time. The words stop meaning anything. You begin to suspect the whole thing is held together by formatting. The fix, at least for me, is usually to read it aloud. The ear catches what the eye has already agreed to.",
    genre: "essay" as const,
    audience: "public" as const,
  },
  {
    text: "small win: finally got the kitchen shelf level on the first try. the secret was to stop rushing the pencil line",
    genre: "post" as const,
    audience: "public" as const,
  },
  {
    text: "Friday: call the plumber. Ask about the pressure valve. Don't forget the meter reading.",
    genre: "note" as const,
    audience: "other" as const,
  },
  {
    text: "For the launch note: lead with the price, not the philosophy. Two sentences on the change. One on what stays the same. Stop.",
    genre: "note" as const,
    audience: "other" as const,
  },
];

async function main() {
  const { createSamples } = await import("@/lib/samples");
  const { createProfile } = await import("@/lib/profile");
  const { createEvalCase, listEvalCases } = await import("@/lib/eval");
  const { closeDb } = await import("@/lib/db");

  try {
    const result = createSamples(
      samples.map((sample) => ({
        ...sample,
        language: "en",
        source: "demo",
        consent: true,
        redact: true,
      })),
    );

    console.log(
      `Seeded ${result.imported} samples (${result.duplicates} duplicates skipped).`,
    );

    const { profile, warning } = await createProfile({ useModel });
    console.log(
      profile
        ? `Profile v${profile.version}: ${profile.status}, ${profile.sampleCount} samples.`
        : "No profile was created.",
    );
    if (warning) console.log(`Note: ${warning}`);

    if (!listEvalCases().some((item) => item.name === "Demo: the launch note")) {
      createEvalCase({
        name: "Demo: the launch note",
        draft:
          "We're excited to share that shared drafts are now available. For months, our team was buried in files named final_v7.docx, and we knew there had to be a better way. Now two people can edit at once and see changes appear live. It's not just a feature; it's a new way to collaborate. Let that sink in.",
        genre: "post",
        audience: "public",
        notes:
          "A generic product announcement. The voice variant should cut the ceremony and keep the specifics.",
      });
      console.log("Created the demo test case.");
    }

    console.log(`Demo database: ${dbPath}`);
    if (!useModel) {
      console.log(
        "Run with --model to generate the written voice card while seeding.",
      );
    }
  } finally {
    closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
