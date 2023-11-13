import express from 'express';
import { json } from 'body-parser';
import cors from 'cors';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, get } from 'firebase/database';
import webpush from 'web-push';
import formidable from 'formidable';

// Configuration comes from environment variables (see README)
const {
  FIREBASE_DB_URL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:test@example.com',
  PORT = '4000',
} = process.env;

if (!FIREBASE_DB_URL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing FIREBASE_DB_URL, VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY environment variable');
  process.exit(1);
}

// TODO: upload the posted image to storage; until then posts use the sample image
const PLACEHOLDER_IMAGE = '/src/images/sf-boat.jpg';

const dbConfig = initializeApp({ databaseURL: FIREBASE_DB_URL });

const db = getDatabase(dbConfig);
const postsRef = ref(db, '/posts');
const subscriptionsRef = ref(db, '/subscription');
const app = express();

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

app.use(json());
app.use(cors());

// the client sends new posts as multipart/form-data (id, title, location, file)
app.post('/', async (req, res) => {
  try {
    const [fields] = await formidable({}).parse(req);
    const post = {
      id: fields.id?.[0],
      title: fields.title?.[0],
      location: fields.location?.[0],
      image: PLACEHOLDER_IMAGE,
    };

    await push(postsRef, post);

    // read the subscriptions once (a listener here would fire again on every later change)
    const subs = await get(subscriptionsRef);
    subs.forEach((sub) => {
      const pushConfig = {
        endpoint: sub.val().endpoint,
        keys: {
          auth: sub.val().keys.auth,
          p256dh: sub.val().keys.p256dh,
        },
      };

      webpush
        .sendNotification(
          pushConfig,
          JSON.stringify({
            title: 'New Post',
            content: 'New Post added',
            openUrl: '/help',
          })
        )
        .catch((err) => {
          console.log(err);
        });
    });

    res.status(201).send({ message: 'Data stored', id: post.id });
  } catch (err) {
    console.log(err);
    res.status(500).send({ err });
  }
});

app.get('/', async (req, res) => {
  try {
    const snapshot = await get(postsRef);
    res.send(snapshot.val());
  } catch (err) {
    res.status(500).send({ err });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Listening on ${PORT}`);
});
