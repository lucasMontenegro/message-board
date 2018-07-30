
'use strict';
const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;
const ObjectID = mongo.ObjectID;

module.exports = async function (app, done) {
  const opts = { useNewUrlParser: true };
  const client = await MongoClient.connect(process.env.DB_URL, opts);
  const collection = client.db().collection(process.env.COLL_NAME);

  app.route('/api/threads/:board')
    .get(getThreads(collection))
    .post(postThread(collection))
    .put(reportThread(collection))
    .delete(deleteThread(collection));

  app.route('/api/replies/:board')
    .get(getReplies(collection))
    .post(postReply(collection))
    .put(reportReply(collection))
    .delete(deleteReply(collection));

  done();
};


// I can GET an array of the most recent 10 bumped threads on the board with
// only the most recent 3 replies from /api/threads/{board}. The reported and
// delete_passwords fields will not be sent.
const getThreads = collection => async (req, res) => {
  const pipeline = [
    { $match: {
      board: req.params.board,
      deleted_on: { $exists: false },
    } },
    { $sort: { bumped_on_int: -1 } }, { $limit: 10 },
    { $redact: { $cond: {
      if: { $ne: [ {$type: "$deleted_on"}, "string" ] },
      then: "$$DESCEND",
      else: "$$PRUNE",
    } } },
    { $project: {
      _id: 1,
      text: 1,
      created_on: 1,
      bumped_on: 1,
      replies: { $slice: [ "$replies", -3 ] },
    } },
    { $project: {
      _id: 1,
      text: 1,
      created_on: 1,
      bumped_on: 1,
      "replies._id": 1,
      "replies.text": 1,
      "replies.created_on": 1,
    } },
  ];
  let docs;
  try {
    docs = await collection.aggregate(pipeline).toArray();
  } catch (error) {
    console.error(error);
    res.status(500).send('error fetching data');
    return
  }
  res.json(docs);
}


// I can POST a thread to a specific message board by passing form data text and
// delete_password to /api/threads/{board}.(Recomend res.redirect to board page
// /b/{board}) Saved will be _id, text, created_on(date&time),
// bumped_on(date&time, starts same as created_on), reported(boolean),
// delete_password, & replies(array).
const postThread = collection => async (req, res) => {
  const text = req.body.text;
  if (typeof text !== 'string' || text === '') {
    res.status(400).send('missing message text');
    return
  }
  const now = new Date();
  const nowStr = now.toString();
  const nowInt = now.getTime();

  const thread_id = new ObjectID();
  const doc = {
    _id: thread_id,
    board: req.params.board,
    text,
    created_on: nowStr,
    bumped_on: nowStr,
    bumped_on_int: nowInt,
    delete_password: req.body.delete_password,
    replies: [],
  };
  let result;
  try {
    result = await collection.insertOne(doc);
  } catch (error) {
    console.error(error);
    res.status(500).send('error saving data');
    return
  }
  if (result.insertedCount === 0) {
    res.status(500).send('no data saved');
    return
  }
  res.redirect(303, '/b/'+req.params.board+'/'+thread_id);
}


// I can report a thread and change it's reported value to true by sending a PUT
// request to /api/threads/{board} and pass along the thread_id.
// (Text response will be 'success')
const reportThread = collection => async (req, res) => {
  const thread_id = req.body.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }

  const filter = {
    _id: new ObjectID(thread_id),
    board: req.params.board,
    deleted_on: { $exists: false },
  };
  const update = { $set: { reported_on: new Date().toString() } };
  let result;
  try {
    result = await collection.updateOne(filter, update);
  } catch (error) {
    console.error(error);
    res.status(500).send('error reporting thread');
    return
  }
  if (result.modifiedCount === 0) {
    res.status(404).send('no thread reported');
    return
  }
  res.send('success');
}


// I can delete a thread completely if I send a DELETE request to
// /api/threads/{board} and pass along the thread_id & delete_password.
// (Text response will be 'incorrect password' or 'success')
const deleteThread = collection => async (req, res) => {
  let input;
  if (typeof req.query.thread_id === 'undefined') {
    input = req.body;
  } else {
    input = req.query;
  }

  const thread_id = input.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }
  const delete_password = input.delete_password;
  if (typeof delete_password !== 'string') {
    res.status(400).send('bad delete_password');
    return
  }

  const filter = {
    _id: new ObjectID(thread_id),
    board: req.params.board,
    delete_password,
    deleted_on: { $exists: false },
  };
  const update = { $set: { deleted_on: new Date().toString() } };
  let result;
  try {
    result = await collection.updateOne(filter, update);
  } catch (error) {
    console.error(error);
    res.status(500).send('error deleting thread');
    return
  }
  if (result.modifiedCount === 0) {
    res.status(400).send('incorrect password');
    return
  }
  res.send('success');
}



// I can GET an entire thread with all it's replies from
// /api/replies/{board}?thread_id={thread_id}. Also hiding the same fields.
const getReplies = collection => async (req, res) => {
  const thread_id = req.query.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }

  const pipeline = [
    { $match: {
      _id: new ObjectID(thread_id),
      board: req.params.board,
      deleted_on: { $exists: false }
    } },
    { $redact: { $cond: {
      if: { $ne: [ {$type: "$deleted_on"}, "string" ] },
      then: "$$DESCEND",
      else: "$$PRUNE",
    } } },
    { $project: {
      _id: 1,
      text: 1,
      created_on: 1,
      bumped_on: 1,
      "replies._id": 1,
      "replies.text": 1,
      "replies.created_on": 1,
    } },
  ];
  let docs;
  try {
    docs = await collection.aggregate(pipeline).toArray();
  } catch (error) {
    console.error(error);
    res.status(500).send('error fetching data');
    return
  }
  if (docs.length === 0) {
    res.status(404).send('no thread found');
    return
  }
  res.json(docs[0]);
}


// I can POST a reply to a thead on a specific board by passing form data text,
// delete_password, & thread_id to /api/replies/{board} and it will also update
// the bumped_on date to the comments date.(Recomend res.redirect to thread page
// /b/{board}/{thread_id}) In the thread's 'replies' array will be saved _id,
// text, created_on, delete_password, & reported.
const postReply = collection => async (req, res) => {
  const thread_id = req.body.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }
  const text = req.body.text;
  if (typeof text !== 'string' || text === '') {
    res.status(400).send('missing message text');
    return
  }

  const filter = {
    _id: new ObjectID(thread_id),
    board: req.params.board,
    deleted_on: { $exists: false }
  };
  const now = new Date().toString();
  const update = {
    $set: { bumped_on: now },
    $push: { replies: {
      _id: new ObjectID(),
      text,
      created_on: now,
      delete_password: req.body.delete_password,
    } },
  };
  let result;
  try {
    result = await collection.updateOne(filter, update);
  } catch (error) {
    console.error(error);
    res.status(500).send('error saving data');
    return
  }
  if (result.modifiedCount === 0) {
    res.status(404).send('no data saved');
    return
  }
  res.redirect('/b/'+req.params.board+'/'+thread_id);
}


// I can report a reply and change it's reported value to true by sending a PUT
// request to /api/replies/{board} and pass along the thread_id & reply_id.
// (Text response will be 'success')
const reportReply = collection => async (req, res) => {
  const thread_id = req.body.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }
  const reply_id = req.body.reply_id;
  if (typeof reply_id !== 'string'
    || !ObjectID.isValid(reply_id)) {
    res.status(400).send('bad reply_id');
    return
  }

  const filter = {
    _id: new ObjectID(thread_id),
    board: req.params.board,
    deleted_on: { $exists: false },
    "replies._id": new ObjectID(reply_id),
    "replies.deleted_on": { $exists: false },
  };
  const update = { $set: { "replies.$.reported_on": new Date().toString() } };
  let result;
  try {
    result = await collection.updateOne(filter, update);
  } catch (error) {
    console.error(error);
    res.status(500).send('error reporting reply');
    return
  }
  if (result.modifiedCount === 0) {
    res.status(404).send('no reply reported');
    return
  }
  res.send('success');
}


// I can delete a post(just changing the text to '[deleted]') if I send a DELETE
// request to /api/replies/{board} and pass along the thread_id, reply_id, &
// delete_password. (Text response will be 'incorrect password' or 'success')
const deleteReply = collection => async (req, res) => {
  const thread_id = req.body.thread_id;
  if (typeof thread_id !== 'string'
    || !ObjectID.isValid(thread_id)) {
    res.status(400).send('bad thread_id');
    return
  }
  const reply_id = req.body.reply_id;
  if (typeof reply_id !== 'string'
    || !ObjectID.isValid(reply_id)) {
    res.status(400).send('bad reply_id');
    return
  }
  const delete_password = req.body.delete_password;
  if (typeof delete_password !== 'string' || delete_password === '') {
    res.status(400).send('missing delete_password');
    return
  }

  const filter = {
    _id: new ObjectID(thread_id),
    board: req.params.board,
    deleted_on: { $exists: false },
    "replies._id": new ObjectID(reply_id),
    "replies.delete_password": delete_password,
    "replies.deleted_on": { $exists: false },
  };
  const update = { $set: { "replies.$.deleted_on": new Date().toString() } };
  let result;
  try {
    result = await collection.updateOne(filter, update);
  } catch (error) {
    console.error(error);
    res.status(500).send('error deleting reply');
    return
  }
  if (result.modifiedCount === 0) {
    res.status(400).send('incorrect password');
    return
  }
  res.send('success');
}
