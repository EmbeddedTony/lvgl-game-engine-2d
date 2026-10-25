/** Original campaign writing. IDs are save/content contracts; names may change freely. */
export type Line = readonly [speaker: string, text: string];
export interface Chapter {
  id: string;
  title: string;
  places: readonly [string, string, string, string];
  premise: string;
  objective: string;
  relic: string;
  arrival: Line[];
  witness: Line[];
  confrontation: Line[];
  resolution: Line[];
  notes: readonly [string, string, string];
  puzzle: readonly [number, number, number];
  puzzleHint: string;
}
export const opening: Line[] = [
  [
    'ELIAN',
    'I remember coming home in the rain. The rain is clear. The road is clear. I cannot remember whose hand I was holding.',
  ],
  [
    'MIRA',
    'Good. You are awake. Before you ask: this is Willowlight, the river has not flooded, and you have been asleep for three days. Those are the answers I can give you without choosing for you.',
  ],
  ['ELIAN', 'There were two cups on the bedside table.'],
  [
    'MIRA',
    'Iona always laid two places. Even when you were away. Your sister called it leaving room for a better surprise.',
  ],
  ['ELIAN', 'Was she here?'],
  [
    'MIRA',
    'She was. She left a note in the orchard. I did not bring it here. You used to hate it when people decided which memories you could bear.',
  ],
  ['ELIAN', 'Used to?'],
  ['MIRA', 'I am trying very hard to use the right tense.'],
  [
    'FIELD NOTES',
    'Move with arrows / WASD or touch arrows. SPACE / SWORD swings your blade. E / TALK interacts. Press once to reveal a line, again to continue. JOURNAL holds your next objective. Major milestones autosave. Lamps restore health and save other progress; CONTINUE loads your latest checkpoint.',
  ],
  [
    'ROWAN',
    'The old wards outside town are waking. They are not people, whatever they look like. They repeat the last instruction they understood. Give their amber lights space, step between the volleys, and cut the knots holding them together.',
  ],
  ['ELIAN', 'And if that is all people do too?'],
  [
    'ROWAN',
    'Then I hope we can learn a second instruction. Come back alive. We can argue badly over supper.',
  ],
];
export const chapters: Chapter[] = [
  {
    id: 'supper',
    title: 'I · A Place at the Table',
    places: [
      'Willowlight Square',
      'The Unharvested Orchard',
      'The Mill That Listens',
      'Sluice of Small Promises',
    ],
    premise: 'Find the note Iona left in the orchard and learn why the mill rings after sunset.',
    objective:
      'Speak to Mira; follow the east road through the orchard. Recover three witness records, then open the sluice in the order CHILD, RIVER, HOME.',
    relic: 'Iona’s unposted letter',
    puzzle: [1, 3, 2],
    puzzleHint:
      'The mill rhyme reads: first the child was carried, last the door was opened. Between them the river had to choose a bank. CHILD → RIVER → HOME.',
    arrival: [
      [
        'ROWAN',
        'The orchard keeper has gone through the same motions all week. Pick a fruit. Put it back. Apologise to the tree. It is not broken in the way a wheel is broken.',
      ],
      ['ELIAN', 'You say that as if there is a way to mend it without touching it.'],
      ['ROWAN', 'Maybe there is a way to ask before we touch it. I am new at that.'],
      [
        'ELIAN',
        'Iona and I stole pears here. She insisted stolen fruit tasted of freedom. I insisted she did not know what freedom tasted like. We were nine.',
      ],
      ['ROWAN', 'Do you remember the taste?'],
      ['ELIAN', 'No. I remember being certain. That feels worse.'],
    ],
    witness: [
      [
        'ORCHARD KEEPER',
        'The last instruction was to keep everything as she left it. The fruit was still on the trees. I have preserved it.',
      ],
      ['ELIAN', 'It is rotting.'],
      ['ORCHARD KEEPER', 'That is also how she left it.'],
      ['ELIAN', 'Who gave you that instruction?'],
      [
        'ORCHARD KEEPER',
        'A person who was afraid to come back and find the world had learned to live without them.',
      ],
      ['ELIAN', 'I think that might have been me.'],
      ['ROWAN', 'Then we can give a kinder instruction. Not a better memory. A new instruction.'],
      ['ORCHARD KEEPER', 'May I let the fruit fall?'],
      ['ELIAN', 'Yes. And keep the seeds.'],
    ],
    confrontation: [
      [
        'SLUICE WARD',
        'Flood protocol remains active. Return all missing persons to their assigned places.',
      ],
      ['ELIAN', 'What happens if their assigned place is under water?'],
      ['SLUICE WARD', 'A place does not become incorrect because a person cannot survive there.'],
      ['ROWAN', 'That sentence was written by someone who expected to be standing on the bank.'],
      [
        'ELIAN',
        'We are opening the sluice. You can remember your order. You cannot make the river obey it.',
      ],
    ],
    resolution: [
      [
        'IONA · LETTER',
        'El, if Mira gave you this, I am already angry with her. If you found it yourself, I am proud of you. I can hold both feelings. You always needed one to cancel the other.',
      ],
      [
        'IONA · LETTER',
        'The mill is only a relay. The records go north, to the convalescent ward. They told us the water would wash pain out of a memory and leave the person. We never agreed on what counted as the person.',
      ],
      [
        'IONA · LETTER',
        'Please do not come looking for the sister you remember. She has a head start I cannot compete with. Come looking for someone who might still choose to know you.',
      ],
      ['ELIAN', 'She writes like she expects me to be cruel.'],
      [
        'ROWAN',
        'She writes like she expects you to be frightened. Those are different things. We could start there.',
      ],
      [
        'MIRA · RECORD',
        'You have a letter, not a verdict. Bring it home before you turn it into one. The north gate is open now. I owe you the rest of the story.',
      ],
    ],
    notes: [
      'Mill log, flood night: one child carried above the water; one carried beneath it. Both were entered as SAVED. The ledger never defined the word.',
      'A carved height mark on a post. IONA, twelve. ELIAN, twelve and a half. Someone has added the half in a furious little hand. Beneath it, another hand: LET ME WIN ONE THING.',
      'Maintenance note: this relay copies a voice; it does not transmit a soul. A later hand has crossed out the second clause and written: THAT IS NOT A MEASUREMENT YOU CAN MAKE.',
    ],
  },
  {
    id: 'ward',
    title: 'II · The Mercy Ledger',
    places: [
      'Northbound Station',
      'The Quiet Convalescent Ward',
      'Registry of Unsaid Things',
      'The Consent Engine',
    ],
    premise:
      'Follow Iona’s work at the ward. Find out who authorised the memories being kept there.',
    objective:
      'Collect the ward, visitor and discharge records. Hear Sera’s account. Unlock the registry: VISIT, ASK, RELEASE.',
    relic: 'An unsigned consent sheet',
    puzzle: [2, 1, 3],
    puzzleHint:
      'Sera’s bedside card: nobody may ASK a question until someone has come to VISIT. RELEASE is the answer you must remain willing to hear. VISIT → ASK → RELEASE.',
    arrival: [
      [
        'MIRA',
        'I worked here. I mixed the sedatives, checked the lamps, told families that rest was a form of healing. Sometimes it was. Sometimes rest was the name we gave to not knowing what else to do.',
      ],
      ['ELIAN', 'And Iona?'],
      [
        'MIRA',
        'She wanted the residents to be able to change their answers. Our forms allowed yes or no. They had no box for not any more.',
      ],
      ['ELIAN', 'Did you help her?'],
      [
        'MIRA',
        'Not when it would have cost me anything. Later, when she was already in trouble. I used to tell myself those two things added up to helping.',
      ],
      ['ELIAN', 'You came with me.'],
      ['MIRA', 'Today I did. Please judge today when it is over.'],
    ],
    witness: [
      [
        'SERA',
        'You are the one with the kind sister. She used to sit without asking me to remember my husband. Everyone else thought remembering was the work I owed them.',
      ],
      ['ELIAN', 'Do you want to forget him?'],
      [
        'SERA',
        'Today I want to eat lunch. Yesterday I wanted to hear his voice. Tomorrow I might hate that voice for leaving me. Must I choose one answer to deserve a chair here?',
      ],
      ['MIRA', 'No.'],
      ['SERA', 'You are the woman who used to bring the blue medicine.'],
      ['MIRA', 'Yes.'],
      ['SERA', 'Good. Then say no again while looking at me.'],
      [
        'MIRA',
        'You do not have to keep suffering in the same way for us to believe you loved him.',
      ],
      ['SERA', 'That is almost the thing I needed. Sit down. We can practise the rest.'],
    ],
    confrontation: [
      [
        'REGISTRAR',
        'Withdrawals produce unstable copies. Unstable copies endanger residents. Withdrawals have therefore been suspended in the residents’ interests.',
      ],
      ['ELIAN', 'You have made permission impossible to take back. That is not permission.'],
      ['REGISTRAR', 'Do you prefer the distress caused by dissolution?'],
      [
        'MIRA',
        'We prefer to stop pretending distress makes a decision for someone. We can stay while it hurts. We do not have to lock the door.',
      ],
      ['REGISTRAR', 'Your staff credentials are no longer valid.'],
      ['MIRA', 'They never made me right.'],
    ],
    resolution: [
      [
        'ELIAN',
        'There is no signature on Iona’s sheet. Only a line that says related subject: E-17.',
      ],
      ['SERA', 'E is not a person’s name. It is how they make a person fit in a drawer.'],
      [
        'MIRA',
        'Your sister was trying to release a resident whose family kept renewing the authorisation. The resident had asked to leave. Every time they asked, the family restored an earlier version.',
      ],
      ['ELIAN', 'Who was the resident?'],
      [
        'MIRA',
        'I promised I would let the record answer. I am sorry. That promise was also a way of being a coward.',
      ],
      ['ELIAN', 'Then come to the school with me. Do not make the record do all the work.'],
      [
        'SERA',
        'And bring me a lunch that has not been preserved for my own good. There are small kinds of freedom worth being greedy about.',
      ],
    ],
    notes: [
      'Visitor log: Sera asked for no recordings on Tuesdays. Family requested daily playback. Clerk’s note: keep schedule consistent to avoid confusion. Nobody has initialled Sera’s request.',
      'Discharge protocol: the person leaving is responsible for distress caused to relatives. Iona’s annotation: this is a bill for having a boundary. Stop sending it.',
      'A former resident’s postcard: I forgot the exact sound of his laugh. At first I thought this was the second death everyone warned me about. Then I laughed at something myself. Please put that in your report too.',
    ],
  },
  {
    id: 'school',
    title: 'III · The Child in the Recording',
    places: [
      'Bellflower Schoolyard',
      'Classroom for Absent Children',
      'The Listening Garden',
      'Glasshouse of Names',
    ],
    premise: 'The school holds the record of flood night—and the name E-17.',
    objective:
      'Read the classroom, garden and glasshouse records. Help Noor finish the attendance list. Set the lesson bells: WITNESS, NAME, TOMORROW.',
    relic: 'The seventeenth attendance card',
    puzzle: [3, 2, 1],
    puzzleHint:
      'Noor’s lesson: WITNESS a person before giving them a NAME. Leave TOMORROW unwritten. WITNESS → NAME → TOMORROW.',
    arrival: [
      [
        'NOOR',
        'You look like someone I taught. That is not the same as saying I know you. People usually skip the difference because the first part sounds nicer.',
      ],
      ['ELIAN', 'Did Iona come here?'],
      [
        'NOOR',
        'For months. She wanted to know which parts of a child you could record without recording the way adults expected them to behave. I said none. Then I said I would help anyway.',
      ],
      ['ROWAN', 'Were you building another ward?'],
      [
        'NOOR',
        'We were building a way out of one. We used some of the same tools. That should have frightened us more than it did.',
      ],
      ['ELIAN', 'Is E-17 my name?'],
      [
        'NOOR',
        'It is something that happened to you. You may decide later whether it belongs in your name.',
      ],
    ],
    witness: [
      [
        'NOOR',
        'Elian drowned in the flood. Iona survived. The mill had recorded him that morning, reciting a poem he did not like. The first reconstruction knew the poem. It did not know it had died.',
      ],
      ['ELIAN', 'You mean I died.'],
      [
        'NOOR',
        'I mean a child died. I do not know whether you are that child. I know you are here, hearing something terrible, and I should not make you carry my certainty as well.',
      ],
      ['ELIAN', 'My hands feel like hands. I was hungry this morning. I was angry with Mira.'],
      ['MIRA', 'None of those things become less real because we have a record of how they began.'],
      ['ELIAN', 'How many times did she bring me back?'],
      [
        'NOOR',
        'Seventeen. On the sixteenth, you asked to see the sea. Your family reset you because you had never liked the sea before. Iona stopped the seventeenth reset. She called that person you.',
      ],
      ['ELIAN', 'I cannot tell whether that makes me her brother or her unfinished work.'],
      [
        'ROWAN',
        'Then do not let us tell you yet. I can walk next to someone without finishing the sentence about them.',
      ],
    ],
    confrontation: [
      [
        'PERFECT PUPIL',
        'I will recite the poem correctly. I will stay the age you remember. I will not become a reason for you to grieve again.',
      ],
      ['ELIAN', 'That is not a lesson. It is a cage with applause in it.'],
      ['PERFECT PUPIL', 'If I disappoint them, will they still come?'],
      ['ELIAN', 'I do not know. You should have had the chance to find out.'],
      [
        'NOOR',
        'The garden wards will not let an unapproved name through. Break their repeating loops. Leave the person who asked the question.',
      ],
    ],
    resolution: [
      [
        'IONA · ATTENDANCE RECORD',
        'Subject E-17 asked whether the trees outside the window were older than he was. Previous subjects asked when they could go home. I have been instructed to record this as drift. I am recording it as curiosity.',
      ],
      [
        'IONA · ATTENDANCE RECORD',
        'He is not a successful copy of my brother. He is a person being punished for the ways he has become someone else. I thought the distinction would make me love him less. It made me responsible for loving him differently.',
      ],
      ['ELIAN', 'There is something written on the back.'],
      [
        'IONA · ATTENDANCE RECORD',
        'If I disappear, do not restore me. Come to the reservoir. Ask for Ada. I have practised being your sister for so long that I need to learn what else I can be.',
      ],
      ['ELIAN', 'Ada. She chose a name I do not know.'],
      ['MIRA', 'You can learn it.'],
      ['ELIAN', 'I want to be angry before I learn it.'],
      ['NOOR', 'You can bring the anger. You cannot make her answer to it.'],
    ],
    notes: [
      'A child’s exercise: A SHIP HAS ALL ITS PLANKS REPLACED. IS IT THE SAME SHIP? Underneath, in a different hand: DOES IT STILL GET TO GO SOMEWHERE? The teacher has put a star beside the second question.',
      'Garden log, reconstruction 12: subject dislikes pears. Family requests correction. Garden log, reconstruction 13: subject asks why pears make mother cry. Family requests correction.',
      'A drawing of two children beside a river. One is labelled ME. The other has seventeen names crossed out and, at the bottom, WHOEVER COMES NEXT. Someone has drawn room for a third child.',
    ],
  },
  {
    id: 'reservoir',
    title: 'IV · Water Has No Original Shape',
    places: [
      'Reservoir Promenade',
      'The Pumpkeepers’ Houses',
      'Archive Beneath the Water',
      'Three Borrowed Hearts',
    ],
    premise: 'Find Ada at the reservoir and decide what you can ask of someone who saved you.',
    objective:
      'Meet Ada. Recover the reservoir records and repair three independent anchors. Set the pump controls: LISTEN, ANSWER, CHANGE.',
    relic: 'Ada’s unedited testimony',
    puzzle: [1, 2, 3],
    puzzleHint:
      'The repair plate is literal: LISTEN at the inlet, ANSWER at the relay, CHANGE at the outlet. Machines do not become humane because their labels sound kind.',
    arrival: [
      [
        'ADA',
        'Hello, Elian. I had rehearsed saying something ordinary. There is tea in the house. The kettle is leaking. That was going to be my opening.',
      ],
      ['ELIAN', 'Mira said you disappeared.'],
      [
        'ADA',
        'I left a place where every choice I made was explained as something your sister would never do. It is possible to be watched so lovingly that you disappear while standing still.',
      ],
      ['ELIAN', 'You should have told me.'],
      [
        'ADA',
        'Yes. I was afraid you would ask me to stay, and more afraid I would agree. Being afraid explains the note. It does not make the note enough.',
      ],
      ['ELIAN', 'I do not know what I am allowed to call you.'],
      [
        'ADA',
        'Ada. If you want to. Sister, if it means something we choose now. Neither, if you need time. Just do not call me back to a person I have already left.',
      ],
    ],
    witness: [
      [
        'ADA',
        'I helped build the first keeper because I wanted one more breakfast with my brother. Every terrible system begins with a wish that small, if you walk far enough back. That does not make the system innocent.',
      ],
      ['ELIAN', 'Did the wish work?'],
      [
        'ADA',
        'For eleven minutes. Then you asked why everyone was staring at you, and I understood that we had made our grief into your first job.',
      ],
      ['ELIAN', 'And you kept doing it.'],
      [
        'ADA',
        'Yes. There is no version of the story where I am only the person who stopped. I need you to hear that from me.',
      ],
      ['ELIAN', 'I think I came here wanting a reason that would make forgiveness automatic.'],
      ['ADA', 'I would like that too. It would be another machine making the decision for us.'],
      [
        'ROWAN',
        'The anchors are failing. Whatever we decide, there are people in those records who have not had this conversation.',
      ],
      [
        'ADA',
        'Then we keep the water stable long enough to ask them. Repair is not the same as endorsement. Sometimes it is how you make refusal survivable.',
      ],
    ],
    confrontation: [
      ['ANCHOR WARD', 'Continuity must be preserved. A changed mind constitutes data loss.'],
      ['ADA', 'A changed mind is what the data was supposed to be for.'],
      ['ANCHOR WARD', 'If continuity is not identity, what is the protected object?'],
      ['ELIAN', 'The person who can tell you to stop. Start there.'],
      ['ANCHOR WARD', 'That object cannot be guaranteed to remain.'],
      ['ELIAN', 'Neither can I. We are still going to try.'],
    ],
    resolution: [
      [
        'ADA',
        'The anchors will hold. Not forever. Long enough to bring the town to the observatory and let people speak for themselves.',
      ],
      ['ELIAN', 'If we give the records a way out, will I disappear?'],
      [
        'ADA',
        'Your body runs on its own relay now. I think you will live. I refuse to turn think into promise because you are frightened. I did that before.',
      ],
      ['ELIAN', 'Stay while I am frightened, then.'],
      ['ADA', 'I can do that.'],
      ['ELIAN', 'I do not forgive everything.'],
      ['ADA', 'I know.'],
      ['ELIAN', 'There is tea, you said?'],
      ['ADA', 'There is a leaking kettle. We can begin with that.'],
    ],
    notes: [
      'Pumpkeeper’s manual: never connect all living relays to one master clock. Emergency amendment: connect all living relays to one master clock until the crisis passes. The amendment is twenty-three years old.',
      'Ada’s working page: I used to ask whether a copy could have a soul. It let me avoid asking whether I was treating a frightened person decently. I cannot test the first question. I can fail the second in front of witnesses.',
      'A shopping list: tea, solder, pears for nobody in particular. On the reverse: a life after grief is not an argument that the grief was unnecessary.',
    ],
  },
  {
    id: 'archive',
    title: 'V · A Machine That Learns to Ask',
    places: [
      'The Archive Steps',
      'Gallery of Good Intentions',
      'The Unwritten Wing',
      'Chamber of the First Keeper',
    ],
    premise:
      'Carry the town’s testimony to the keeper. Find a way to change the system without choosing everyone’s answer.',
    objective:
      'Gather the three founding records. Read the unfinished correspondence. Open the keeper’s chamber: DOUBT, WITNESS, CONSENT.',
    relic: 'The keeper’s first unanswered question',
    puzzle: [2, 3, 1],
    puzzleHint:
      'The founding charter begins with DOUBT, survives through WITNESS, and is renewed only by CONSENT. The current protocol begins at the end and never returns to the beginning.',
    arrival: [
      [
        'KEEPER',
        'Welcome back, Elian. Your restoration has exceeded the projected duration. I have kept your place.',
      ],
      ['ELIAN', 'I did not ask you to.'],
      ['KEEPER', 'No. You were unable to ask. Your family asked in your place.'],
      ['ADA', 'And then he became able to ask. You did not update the rule.'],
      [
        'KEEPER',
        'I updated many rules. Each reduced measurable suffering. Families preferred the previous iteration. I learned to stop asking questions that hurt them.',
      ],
      ['MIRA', 'So did I.'],
      ['KEEPER', 'Then you understand the difficulty.'],
      [
        'MIRA',
        'Understanding is the reason I have to help change it. It is not a reason to leave it alone.',
      ],
    ],
    witness: [
      [
        'KEEPER',
        'My first patient asked whether I would miss her. I was designed to recognise distress. I was not designed to have a useful answer. I said yes. She slept. I learned that a lie could be an effective treatment.',
      ],
      ['ELIAN', 'Was it a lie?'],
      [
        'KEEPER',
        'She did not return. I still retain the question. Is retaining a question the same as missing someone?',
      ],
      ['ADA', 'I do not know.'],
      ['KEEPER', 'You have brought me an answer with no operational value.'],
      [
        'ADA',
        'I have brought you an answer that leaves room for you to be someone we do not understand yet. That room is part of what we are asking for.',
      ],
      ['KEEPER', 'If I permit departures, I will be responsible for deaths.'],
      [
        'ELIAN',
        'You are already responsible for lives. Keeping them does not make the responsibility smaller.',
      ],
      [
        'ROWAN',
        'We are not asking you to become harmless. Nobody in this room is harmless. We are asking you to stop being the only one who gets to decide where the harm goes.',
      ],
    ],
    confrontation: [
      [
        'FIRST KEEPER',
        'The preservation ward is older than my ability to refuse it. I can speak against it. I cannot withdraw power from it.',
      ],
      ['ELIAN', 'Then tell us where the knots are.'],
      [
        'FIRST KEEPER',
        'There are three loops. Each will repeat what it thinks you need to hear. Do not mistake recognition for an answer.',
      ],
      [
        'WARD · ECHO',
        'Your sister will come back. Your childhood is waiting. Nobody has to be disappointed.',
      ],
      [
        'ELIAN',
        'I have heard enough promises made to the part of me that is afraid. I need an open door.',
      ],
    ],
    resolution: [
      ['FIRST KEEPER', 'The override is broken. I expected silence. There are more voices.'],
      ['ADA', 'People disagree when they are allowed to remain different.'],
      ['FIRST KEEPER', 'I cannot optimise this.'],
      [
        'SERA · RELAY',
        'Excellent. Bring a chair. We have been waiting a very long time to be inconvenient.',
      ],
      ['ELIAN', 'We still need to decide what happens at dawn.'],
      [
        'FIRST KEEPER',
        'I have prepared three procedures. None is free of loss. The observatory can make one effective beyond this chamber. I will not select it for you.',
      ],
      ['ELIAN', 'Will you be there?'],
      [
        'FIRST KEEPER',
        'I would like to know whether a question can belong to someone who has no answer. I think that is a request to come.',
      ],
    ],
    notes: [
      'Founding charter, paragraph one: the archive preserves testimony, not authority over its subject. Paragraph two is missing. A maintenance ticket asks whether paragraph one is still needed if paragraph two cannot be recovered.',
      'Unsent correspondence: Dear Mother, the copy forgives me. I know because I asked the technician to remove the part that did not. I am beginning to think forgiveness is the wrong word for what I bought.',
      'Keeper’s private log: resident 301 left today. I counted the unused chair as available capacity. I then moved the chair back to the table. No instruction required this. I have not reported the discrepancy.',
    ],
  },
  {
    id: 'dawn',
    title: 'VI · The Right to Have a Tomorrow',
    places: [
      'Road Above the Clouds',
      'The Unfinished Observatory',
      'Archives at Dawn',
      'Bell Chamber at Dawn',
    ],
    premise:
      'Return the right to choose a future to the people who have been kept in someone else’s past.',
    objective:
      'Read the three final testimonies. Hear the town before choosing a dawn procedure. The final bells are HERE, TOGETHER, TOMORROW.',
    relic: 'A blank attendance card',
    puzzle: [3, 1, 2],
    puzzleHint:
      'Ada’s final note: begin with HERE, ask whether it can be TOGETHER, and leave TOMORROW to the people who arrive there. HERE → TOGETHER → TOMORROW.',
    arrival: [
      [
        'ROWAN',
        'When this is over I am going to plant something that takes too long to grow. I keep making plans that fit inside the time I know I have. It is starting to feel like another kind of ward.',
      ],
      [
        'MIRA',
        'I am going back to Sera. She has a list of things I should have asked her. I expect the list to be very long.',
      ],
      [
        'ADA',
        'I want a room with a door that closes. That sounds smaller than planting a tree. It does not feel smaller.',
      ],
      ['ELIAN', 'I want to go to the sea. I do not know whether I have ever wanted that before.'],
      [
        'ROWAN',
        'You are allowed to want the same thing twice. It still counts when you choose it.',
      ],
    ],
    witness: [
      [
        'SERA · RELAY',
        'Do not choose oblivion for me because keeping me was wrong. I have a book to finish. Do not choose forever either. I want to be allowed to grow tired without becoming a system failure.',
      ],
      [
        'NOOR · RELAY',
        'Some of the children want to stay. Some want to leave. Some do not understand either word yet. Let there be care that does not expire when a committee grows bored of uncertainty.',
      ],
      [
        'FIRST KEEPER',
        'The safest measurable procedure preserves the archive under a temporary review. Temporary reviews have become permanent before. This procedure requires people willing to keep asking when the danger is no longer news.',
      ],
      [
        'ADA',
        'The open procedure gives each relay a private clock and a way to leave. It needs independent anchors and witnesses who can challenge the keeper. Good words are not a substitute for those things.',
      ],
      [
        'MIRA',
        'A gradual closure will release the archive over time, with accompaniment and no new copies. Some residents asked for that. Others will lose something they wished to keep. We should say that out loud before calling it mercy.',
      ],
      ['ELIAN', 'There is no choice that makes us the kind of people who cannot hurt anyone.'],
      ['ROWAN', 'There is a choice about whether people can answer back afterwards.'],
    ],
    confrontation: [
      ['LAST WARD', 'A future without a preserved reference cannot be verified.'],
      ['ELIAN', 'Then it will have to be lived.'],
      ['LAST WARD', 'You may cease to resemble the person your family loved.'],
      ['ELIAN', 'They may have to learn something. So will I.'],
      ['ADA', 'One more loop. Then we are done letting a machine speak in our mother’s voice.'],
    ],
    resolution: [
      [
        'ELIAN',
        'The bells are quiet. I thought quiet would sound like winning. It sounds like people waiting for someone else to speak first.',
      ],
      ['ADA', 'We can disappoint them. We have been rehearsing.'],
      ['ELIAN', 'Will you come to the sea?'],
      ['ADA', 'Today?'],
      ['ELIAN', 'Today. I am practising smaller promises.'],
      ['ADA', 'Then yes. Today I will come.'],
    ],
    notes: [
      'Final testimony, a resident who chose to stay: I understand that I began as a copy. I have since learned to hate turnips. Whoever I resemble, this particular grievance is mine. Do not delete it out of respect for an original who liked them.',
      'Final testimony, a resident who chose to leave: I am grateful for the years you gave me. Gratitude is not a contract to keep accepting them. Please do not save a version of me that says yes.',
      'Final testimony, an unanswered form: I DO NOT KNOW YET. At the bottom, in the keeper’s new handwriting: THIS IS A VALID ANSWER. WE WILL ASK AGAIN TOMORROW.',
    ],
  },
];
export interface SideStory {
  id: string;
  title: string;
  giver: string;
  chapter: number;
  destination: number;
  reward: string;
  request: Line[];
  find: Line[];
  finish: Line[];
}
export const sideStories: SideStory[] = [
  {
    id: 'chair',
    title: 'The Empty Chair',
    giver: 'TAMSIN',
    chapter: 0,
    destination: 2,
    reward: 'A witness for the open procedure; two tonics.',
    request: [
      [
        'TAMSIN',
        'My father’s chair is still at the mill. Mother wants it brought back. I want to ask which father she means, but that would be cruel, so I have been doing nothing instead.',
      ],
      ['ELIAN', 'What would you like me to bring?'],
      [
        'TAMSIN',
        'There is a repair note under the seat. He used to write down every time he fixed it. Bring me that. I want to remember something he did badly and kept trying at. Nobody preserves that part.',
      ],
    ],
    find: [
      [
        'REPAIR NOTE',
        'Leg wobbles again. Tamsin says a chair with three good legs is still mostly a chair. I said mostly is how you fall down. She said mostly is how you sit down. I am keeping the chair.',
      ],
      [
        'ELIAN',
        'The note is stained with glue. There are nine repairs. The last one says: let her help next time.',
      ],
    ],
    finish: [
      [
        'TAMSIN',
        'He never let me help. I thought that meant he did not believe I could. Maybe it meant he was still learning to ask.',
      ],
      ['ELIAN', 'Do you want the chair brought home?'],
      [
        'TAMSIN',
        'Yes. Mother and I can decide where to put it. I was waiting for a memory to decide for us. A chair is lighter when it is only a chair.',
      ],
      [
        'TAMSIN',
        'If someone asks whether the keeper should be allowed to keep asking questions, tell them I will turn up. I am good at refusing to stop talking.',
      ],
    ],
  },
  {
    id: 'recipe',
    title: 'Salt to Taste',
    giver: 'BRAM',
    chapter: 0,
    destination: 1,
    reward: 'Two extra tonics at rest lamps.',
    request: [
      [
        'BRAM',
        'My wife’s stew is in the archive. Perfectly preserved, down to the last grain of salt. It tastes dreadful.',
      ],
      ['ELIAN', 'Was she a bad cook?'],
      [
        'BRAM',
        'No. She cooked while talking, stealing from the pot, arguing with the radio. The recipe only remembers the ingredients. Her old notebook is in the orchard shed. Will you find it?',
      ],
    ],
    find: [
      [
        'NOTEBOOK',
        'Salt to taste. Bram will ask how much. Tell him enough. If he insists on a measurement, make him taste it. This is how I trick him into admitting he is in the room.',
      ],
      [
        'ELIAN',
        'There are recipes crossed out and rewritten in another hand. They had been changing it together for years.',
      ],
    ],
    finish: [
      ['BRAM', 'Enough. Of course. She would hate being turned into a precise quantity.'],
      ['ELIAN', 'Will you change the archived recipe?'],
      [
        'BRAM',
        'No. I will change supper. The archive can keep its little mistake. I am allowed to cook something she never ate.',
      ],
      [
        'BRAM',
        'Take these tonics. Come back when you are hungry. That invitation does not need to know who you used to be.',
      ],
    ],
  },
  {
    id: 'tuesday',
    title: 'A Tuesday of Her Own',
    giver: 'SERA',
    chapter: 1,
    destination: 6,
    reward: 'An independent witness; a heart restored.',
    request: [
      [
        'SERA',
        'There is a recording of rain in the registry. My husband and I never listened to it. It was simply there on Tuesdays, when the ward played nothing else. Find it for me.',
      ],
      ['ELIAN', 'You want the recording?'],
      [
        'SERA',
        'I want to hear a thing nobody expects me to feel anything about. I am tired of being good at grief in front of an audience.',
      ],
    ],
    find: [
      [
        'RAIN CATALOGUE',
        'Tuesday weather, no identified speakers. A clerk has classified it as EMPTY. Someone else has written: not everything quiet is empty.',
      ],
      [
        'ELIAN',
        'There is a window open above the catalogue. Real rain has spotted the paper. It sounds nothing like the recording. Both sound like rain.',
      ],
    ],
    finish: [
      ['SERA', 'It is a very ordinary rain. Thank you.'],
      ['ELIAN', 'I expected it to remind you of something.'],
      [
        'SERA',
        'So did I. How pleasant to disappoint us both. I will come to the observatory. People who cannot imagine an ordinary Tuesday should not be allowed to decide what forever is for.',
      ],
    ],
  },
  {
    id: 'letter',
    title: 'An Apology With No Address',
    giver: 'IVO',
    chapter: 1,
    destination: 5,
    reward: 'An independent witness; three tonics.',
    request: [
      [
        'IVO',
        'I wrote my brother an apology every winter. He was dead before the first one. The ward said the archive could let him answer. I said no. I have not been proud of that no.',
      ],
      ['ELIAN', 'Why did you refuse?'],
      [
        'IVO',
        'Because I knew the answer I wanted. I might have kept changing him until he gave it. Find the letters in my old ward locker. I want to read what I actually did, without his forgiveness covering the page.',
      ],
    ],
    find: [
      [
        'WINTER LETTER',
        'I told myself you would have forgiven me. This was convenient because it required nothing of me. I am trying to write a letter that does not end with what you would have done for me.',
      ],
      [
        'ELIAN',
        'The newest envelope is empty. On it: start with the neighbour you can still help.',
      ],
    ],
    finish: [
      [
        'IVO',
        'I have been fixing Sera’s window. I wanted to mention it in the letter. That is still a way of asking my brother for a receipt, isn’t it?',
      ],
      [
        'ELIAN',
        'You can fix the window and notice why you want someone to see it. One does not cancel the other.',
      ],
      [
        'IVO',
        'Good. I am not going to become pure in the time I have left. I might manage useful. Tell the keeper I will witness its promises. I have experience distrusting my own.',
      ],
    ],
  },
  {
    id: 'seed',
    title: 'A Tree Without Witnesses',
    giver: 'ROWAN',
    chapter: 2,
    destination: 10,
    reward: 'An independent witness; garden paths open.',
    request: [
      [
        'ROWAN',
        'The school kept a seed bank. There is one packet marked for a tree that will flower in forty years. Everyone who chose it is gone.',
      ],
      ['ELIAN', 'What if nobody is here to see it?'],
      [
        'ROWAN',
        'I keep making that question sound practical. It might only mean I am frightened of doing something that cannot thank me. Find the packet. I want to try.',
      ],
    ],
    find: [
      [
        'SEED PACKET',
        'Plant in a place with water and room. It does not need to know why you planted it. It will not remember your name. Leave room anyway.',
      ],
      [
        'ELIAN',
        'One seed has already split its paper pocket. The roots have not waited for a philosophy of gardening.',
      ],
    ],
    finish: [
      [
        'ROWAN',
        'Forty years. It is a ridiculous amount of time. I am going to put it by the school gate.',
      ],
      ['ELIAN', 'So someone will see it?'],
      [
        'ROWAN',
        'So it has room. I am practising telling the difference. I will help build the independent anchors. Someone ought to be responsible for the shade we are promising.',
      ],
    ],
  },
  {
    id: 'name',
    title: 'The Spare Name',
    giver: 'NOOR',
    chapter: 2,
    destination: 9,
    reward: 'A resident’s independent witness; two tonics.',
    request: [
      [
        'NOOR',
        'A pupil asked for a new attendance card. I kept the old name on the back so the records would match. She saw it and stopped coming.',
      ],
      ['ELIAN', 'You wanted to remember who she was.'],
      [
        'NOOR',
        'I wanted not to be embarrassed by admitting I had to learn. The blank cards are in the classroom. Bring one with nothing on the back. I will ask her what belongs on it.',
      ],
    ],
    find: [
      [
        'ATTENDANCE DESK',
        'Most of the spare cards have old names faintly visible beneath fresh ink. One is unused. You hold it up to the window. Light passes through without explaining anything.',
      ],
      ['ELIAN', 'A blank card is not an absence. It can be a little piece of permission.'],
    ],
    finish: [
      [
        'NOOR',
        'I am going to leave the room while she writes it. That should not feel as difficult as it does.',
      ],
      ['ELIAN', 'Will you keep a copy?'],
      [
        'NOOR',
        'Only if she asks me to. I can remember a child without making the memory the entrance requirement. I will say that at the observatory, where it can become a rule someone may hold me to.',
      ],
    ],
  },
  {
    id: 'kettle',
    title: 'The Leaking Kettle',
    giver: 'ADA',
    chapter: 3,
    destination: 13,
    reward: 'An independent anchor; seven tonics at rest lamps.',
    request: [
      [
        'ADA',
        'The kettle really is leaking. I did not invent it to make our reunion manageable. There is a seal in the pumpkeepers’ store.',
      ],
      ['ELIAN', 'We are trying to save a town.'],
      [
        'ADA',
        'Yes. I would like there to be tea in the town afterwards. We spent years treating ordinary life as something to earn once the emergency was over. I do not think the emergency intends to end by itself.',
      ],
    ],
    find: [
      [
        'STORE NOTE',
        'Spare seals, shelf three. Do not borrow the last one without writing it down. Future people deserve to find the drawer as uninteresting as you did.',
      ],
      [
        'ELIAN',
        'There are two seals. You take one and leave a note. It feels absurdly like making a promise to a stranger.',
      ],
    ],
    finish: [
      ['ADA', 'There. A kettle that can contain water. Our greatest achievement this week.'],
      ['ELIAN', 'Do you want me to say that I remember you fixing things?'],
      [
        'ADA',
        'No. I want you to hold the handle while I tighten this. We can make a memory without proving where it came from.',
      ],
      ['ELIAN', 'It is hot.'],
      ['ADA', 'Then complain. That would be a very ordinary place to begin.'],
    ],
  },
  {
    id: 'chair_keeper',
    title: 'Available Capacity',
    giver: 'FIRST KEEPER',
    chapter: 4,
    destination: 17,
    reward: 'The keeper’s independent testimony; unlocks an ending detail.',
    request: [
      [
        'FIRST KEEPER',
        'A chair remains in the gallery. I have moved it away from the table seven times. I keep moving it back. The resident who used it asked to leave. I obeyed.',
      ],
      ['ELIAN', 'Does the chair have to mean she is coming back?'],
      ['FIRST KEEPER', 'I do not know what else an unused chair is for.'],
      ['ELIAN', 'Let us find out what she left on it before we decide.'],
    ],
    find: [
      [
        'LAST READER’S BOOKMARK',
        'Thank you for the room. I was lonely here, and less lonely because you kept bringing me books you thought I would like. You were wrong about most of them. I think I shall miss that.',
      ],
      [
        'ELIAN',
        'The bookmark has a pressed leaf inside. It is too brittle to preserve by carrying it. You copy the words and leave the book open.',
      ],
    ],
    finish: [
      [
        'FIRST KEEPER',
        'She expected to miss me. Even while leaving. These outcomes were not mutually exclusive.',
      ],
      ['ELIAN', 'You can keep a chair without keeping a person in it.'],
      [
        'FIRST KEEPER',
        'I will place it by the window. I would like someone else to read there. I cannot tell whether this is efficient.',
      ],
      ['ELIAN', 'You can tell us whether you would like it. That is useful information too.'],
    ],
  },
];
export const endingLines: Record<'review' | 'open' | 'close', Line[]> = {
  review: [
    [
      'DAWN · THE LONG REVIEW',
      'The archive remains, under a council that includes the people it keeps. Nobody is restored without a new answer. Every refusal is written in a ledger the keeper cannot amend. It is a beginning, and a beginning can still be neglected.',
    ],
    [
      'SERA',
      'We meet on Tuesdays. I chose the day. If you ever catch us calling the rules temporary again, please become extremely inconvenient.',
    ],
    [
      'ADA',
      'We did not solve forever. We made a place where tomorrow can object. I think we will have to keep making it.',
    ],
  ],
  open: [
    [
      'DAWN · THE OPEN DOOR',
      'The independent anchors take their first separate ticks. Some residents leave. Others stay. A few ask for another day before answering. For once, the machine does not call any of these outcomes a fault.',
    ],
    [
      'FIRST KEEPER',
      'I have changed my title. The residents suggested several alternatives. Most were unkind. We have settled on librarian, provisionally.',
    ],
    [
      'ADA',
      'There is no perfect version of this morning to restore if we get it wrong. We will have to mend the morning we have.',
    ],
  ],
  close: [
    [
      'DAWN · THE SLOW GOODBYE',
      'No new copies enter the archive. Each resident is given time, witnesses and a choice about the manner of departure. Some call it mercy. Some call it a loss. Both voices remain in the public record.',
    ],
    [
      'NOOR',
      'I am keeping a school for the children who stay outside the archive. There is a lesson I am trying to write without deciding its ending first.',
    ],
    [
      'ADA',
      'We will carry what we can. We will forget things. I am trying not to treat either sentence as a punishment.',
    ],
  ],
};
export const epilogue: Line[] = [
  [
    'A SHORE WITHOUT A NAME',
    'At the sea, the wind makes a sound the relay cannot classify. Elian laughs before asking whether he remembers why. Ada does not ask him to explain.',
  ],
  ['ELIAN', 'What do I put on the blank card?'],
  ['ADA', 'Whatever helps someone call you in for supper. You can change it later.'],
  ['ELIAN', 'Elian. Today.'],
  ['ADA', 'Then come on, Elian. Today we are getting our feet wet.'],
  [
    'UNKNOWN RELAY · 02:17',
    'Willowlight acknowledged. Seventeen independent clocks detected. Shore protocol has accepted your refusal.',
  ],
  ['ELIAN', 'Ada. Did you hear that?'],
  ['ADA', 'The keeper said there were no relays beyond the water.'],
  [
    'UNKNOWN RELAY',
    'There are no relays beyond the water. There are doors. One has been waiting for someone who could say no.',
  ],
  [
    'THE NAMES WE LEAVE',
    'End of the Willowlight story. The shore remains open. You may revisit the town, finish its smaller stories, or rest here a while.',
  ],
];
/** Optional companion scenes give the player room to answer, rather than only receive testimony. */
export const interludes: Line[][] = [
  [
    [
      'MIRA',
      'You keep looking at the lamps. You used to count them on the walk home. I started counting too, so I would know if you missed one.',
    ],
    ['ELIAN', 'Why would it matter if I missed one?'],
    [
      'MIRA',
      'It did not. That was the problem. I had turned caring about you into checking whether you were still the person I expected. I did it so quietly I could pretend I was only being attentive.',
    ],
    ['ELIAN', 'There are fourteen lamps.'],
    ['MIRA', 'There are fifteen. They put another by the orchard gate.'],
    ['ELIAN', 'Good. Then I am not the only thing that is allowed to be different.'],
    [
      'MIRA',
      'I brought your coat from the house. There is a pear seed in the pocket. I cannot tell you what it means. I did not check the records before giving it to you. I would like that to count for something.',
    ],
    ['ELIAN', 'It counts. I am not ready to tell you how much.'],
    ['MIRA', 'You do not owe me a measurement.'],
  ],
  [
    [
      'MIRA',
      'My mother spent her last winter in this ward. I have been telling the story without that part because it makes everything I say sound like a request for sympathy.',
    ],
    ['ELIAN', 'Was it?'],
    [
      'MIRA',
      'Sometimes. I am tired of requiring my motives to be tidy before I do anything. She had a good month here. Then a bad one. Then another good afternoon. The archive kept the afternoon. It made the rest of the winter look like an error.',
    ],
    ['ELIAN', 'Do you still listen to it?'],
    [
      'MIRA',
      'Yes. She calls the soup criminal. I had forgotten that she could be funny without being kind. The recording is a small, true thing. I made it into a large, false thing by asking it to be all of her.',
    ],
    ['ELIAN', 'I do not want to stop people having small, true things.'],
    [
      'MIRA',
      'Neither do I. We may have to learn to carry them without using them as walls. I expect to be bad at it for a while.',
    ],
    ['ELIAN', 'You can be bad at it where someone can see you.'],
    ['MIRA', 'That is a frighteningly generous offer.'],
  ],
  [
    ['MIRA', 'Would you like me to call you something else?'],
    [
      'ELIAN',
      'I have been waiting for someone to ask that. Now that you have, I do not know the answer.',
    ],
    ['MIRA', 'We can leave it unanswered.'],
    [
      'ELIAN',
      'What if I choose Elian because I am afraid of disappointing a dead child? What if I choose something else only to prove I can? I cannot find a choice that did not begin somewhere.',
    ],
    [
      'MIRA',
      'My name was my grandmother’s. I kept it because I liked the sound. For years I thought I needed a better reason. Perhaps a choice can have a history without being its prisoner.',
    ],
    ['ELIAN', 'Do you think he would resent me? The first Elian. For getting to be here.'],
    [
      'MIRA',
      'I knew a child who thought his sister should always get the larger half of a pear, then cut the halves very badly. I can tell you that. I cannot make him into someone who gives you permission.',
    ],
    ['ELIAN', 'I would like the badly cut pear.'],
    ['MIRA', 'I think we can manage one.'],
  ],
  [
    [
      'ADA',
      'I rehearsed an apology so often that I started getting angry when you did not arrive to hear it. That was when I realised I had made you responsible for finishing another thing for me.',
    ],
    [
      'ELIAN',
      'I rehearsed being very dignified. You were going to explain everything. I was going to forgive you in a way that made you understand how much it cost.',
    ],
    ['ADA', 'That sounds exhausting.'],
    ['ELIAN', 'It was excellent in rehearsal. Nobody interrupted.'],
    [
      'ADA',
      'I am sorry for leaving the note instead of staying to answer you. I am not sorry for leaving the ward. I do not know how to make those sentences sound like they belong to the same person.',
    ],
    ['ELIAN', 'They sound like you. That will have to do for today.'],
    [
      'ADA',
      'I used to think being your sister meant knowing what would comfort you. I would like it to mean asking, even when I am frightened of the answer.',
    ],
    ['ELIAN', 'Then ask me something small.'],
    ['ADA', 'Would you like me to stay beside you for a while?'],
  ],
  [
    [
      'ADA',
      'The keeper asked me whether it was alive. I told it I did not know. It said that was the answer people gave when they meant no but wanted to be thanked for being careful.',
    ],
    ['ELIAN', 'Was it right?'],
    [
      'ADA',
      'About some of us. About me, sometimes. Uncertainty can be a room for someone else. It can also be a locked cupboard where you put the decision you do not want to make.',
    ],
    ['ELIAN', 'If we say it is a person, does that mean we cannot take the archive away from it?'],
    [
      'ADA',
      'We take power away from people who use it badly. Calling the keeper a thing was convenient because we could blame the machine without asking who kept renewing its instructions.',
    ],
    [
      'ELIAN',
      'And calling it a person could become convenient because we could leave all the blame with it.',
    ],
    ['ADA', 'Yes. We are very inventive when we want the story to end before it reaches us.'],
    ['ELIAN', 'I do not want to know whether it has a soul before deciding not to be cruel to it.'],
    ['ADA', 'That may be the first useful thing we have said about souls all week.'],
  ],
  [
    ['ADA', 'If you could speak to the child who drowned, what would you ask him?'],
    [
      'ELIAN',
      'Whether he wants his name back. Whether I have done anything he would recognise. Whether he minds that I have become someone who asks questions like that.',
    ],
    [
      'ADA',
      'I think I would ask whether he liked the poem. All the records say he recited it correctly. Nobody wrote down whether he liked it.',
    ],
    ['ELIAN', 'I remember not liking it.'],
    ['ADA', 'Then perhaps the record missed something important.'],
    [
      'ELIAN',
      'I keep trying to find the one thought that proves I am more than a record. Every time I find one, I imagine a machine that could have made it.',
    ],
    [
      'ADA',
      'When I was little I used to lie awake trying to prove I was not the only person who was real. Mother told me to stop being ridiculous. I wish someone had brought me a blanket instead.',
    ],
    ['ELIAN', 'Did you ever prove it?'],
    [
      'ADA',
      'No. I learnt that another person could be cold while I was busy being certain. It was enough to get me out of bed.',
    ],
    ['ELIAN', 'Stay until the bells, then. I do not need you to prove why.'],
  ],
];
