/* global suite */
/* global test */
/* global suiteSetup */


const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function() {

  suite('API ROUTING FOR /api/threads/:board', function() {

// I can POST a thread to a specific message board by passing form data text and
// delete_password to /api/threads/{board}.(Recomend res.redirect to board page
// /b/{board}) Saved will be _id, text, created_on(date&time),
// bumped_on(date&time, starts same as created_on), reported(boolean),
// delete_password, & replies(array).
  suite('POST', function() {

    test('User can post a thread.', function (done) {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "thread 1", delete_password: "secret" })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          expect(res).to.redirect;
          let text = 'response should redirect to thread page';
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/(\d|[a-f]){24}/;
          assert.match(res.redirects[0], re, text);
          done();
        });
    });

    test('User can post a thread without delete password.', function (done) {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "thread 2" })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          expect(res).to.redirect;
          let text = 'response should redirect to thread page';
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/(\d|[a-f]){24}/;
          assert.match(res.redirects[0], re, text);
          done();
        });
    });

  });

// I can GET an array of the 10 most recently bumped threads on the board with
// only the most recent 3 replies from /api/threads/{board}. The reported and
// delete_passwords fields will not be sent.
  suite('GET', function() {

    suiteSetup(done => {
      const reqs = [];
      for (let i = 0; i < 10; i++) {
        reqs.push(chai
          .request(server)
          .post("/api/threads/g")
          .send({ text: "(get) thread " + i, delete_password: 'secret' + i }));
      }
      Promise.all(reqs)
        .then(() => done())
        .catch(reason => {
          const msg = 'Something happened while posting the test threads:\n';
          console.error(msg + reason);
          done(null);
        });
    });

    test('User can get the most recently bumped threads.', function (done) {
      chai
        .request(server)
        .get("/api/threads/g")
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          assert.isArray(res.body, 'response should be an array');
          assert.equal(res.body.length, 10, 'response should contain 10 threads');

          let n = 0;
          const threads = res.body;
          for (let i = 9; i >= 0; i--) {
            assert.isUndefined(threads[i].deleted_on, 'deleted_on should be undefined');
            assert.match(threads[i]._id, /^[\da-f]{24}$/, 'invalid thread _id');
            assert.isString(threads[i].text, 'text should be a string');

            const created_on = Date.parse(threads[i].created_on);
            assert.isNotNaN(created_on, 'created_on should be a valid date');
            bumped_on = Date.parse(threads[i].bumped_on);
            assert.isNotNaN(bumped_on, 'bumped_on should be a valid date');
            const text = 'threads should be ordered by bumped_on';
            assert.isAtLeast(bumped_on, n, text);
            n = bumped_on;

            assert.isArray(threads[i].replies, 'replies should be an array');
            for (let reply of threads[i].replies) {
              assert.match(reply._id, /^[\da-f]{24}$/, 'invalid replies._id');
              assert.isString(reply.text, 'replies.text should be a string');
              const created_on = Date.parse(reply.created_on);
              assert.isNotNaN(created_on, 'replies.created_on should be a valid date');
              assert.isUndefined(reply.deleted_on, 'replies.deleted_on should be undefined');
            }
          }
          done();
        });
    });

  });

// I can delete a thread completely if I send a DELETE request to
// /api/threads/{board} and pass along the thread_id & delete_password.
// (Text response will be 'incorrect password' or 'success')
  suite('DELETE', function() {

    let thread_id;
    const delete_password = "secret hmm";
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(delete) thread", delete_password })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          done();
        });
    });

    test('User sends incorrect password.', function (done) {
      chai
        .request(server)
        .delete("/api/threads/g")
        .send({ thread_id, delete_password: "hmm" })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 400, 'http status should be 400');
          assert.equal(res.text, 'incorrect password', 'bad response text');
          done();
        });
    });
    test('User can delete a thread.', function (done) {
      chai
        .request(server)
        .delete("/api/threads/g")
        .send({ thread_id, delete_password })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          assert.equal(res.text, 'success', 'bad response text');
          done();
        });
    });

  });

// I can report a thread and change it's reported value to true by sending a PUT
// request to /api/threads/{board} and pass along the thread_id.
// (Text response will be 'success')
  suite('PUT', function() {

    let thread_id;
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(put/report) thread", delete_password: 'secret' })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          done();
        });
    });

    test('User can report a thread.', function (done) {
      chai
        .request(server)
        .put("/api/threads/g")
        .send({ thread_id })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          assert.equal(res.text, 'success', 'bad response text');
          done();
        });
    });
  });

  });



  suite('API ROUTING FOR /api/replies/:board', function() {

// I can POST a reply to a thead on a specific board by passing form data text,
// delete_password, & thread_id to /api/replies/{board} and it will also update
// the bumped_on date to the comments date.(Recomend res.redirect to thread page
// /b/{board}/{thread_id}) In the thread's 'replies' array will be saved _id,
// text, created_on, delete_password, & reported.
  suite('POST', function() {

    let thread_id;
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(post reply) thread", delete_password: 'secret' })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          done();
        });
    });

    test('User can post a reply to a thread.', function (done) {
      chai
        .request(server)
        .post("/api/replies/g")
        .send({
          thread_id,
          text: "reply 1",
          delete_password: "reply secret",
        })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          expect(res).to.redirect;
          let text = 'response should redirect to thread page';
          const reStr = '^[^\\/]*\\/\\/[^\\/\\?]*\\/b\\/g\\/' + thread_id;
          assert.match(res.redirects[0], new RegExp(reStr), text);
          done();
        });
    });
  });

// I can GET an entire thread with all it's replies from
// /api/replies/{board}?thread_id={thread_id}. Also hiding the same fields.
  suite('GET', function() {

    let thread_id;
    const delete_password = 'secret';
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(get replies) thread", delete_password })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          done();
        });
    });

    test('User can request a thread.', function (done) {
      chai
        .request(server)
        .get("/api/replies/g")
        .query({ thread_id })
        .end((err, res) => {
          if (err) throw err;
          assert.equal(res.status, 200, 'http status should be 200');
          assert.match(res.body._id, /^[\da-f]{24}$/, 'invalid _id');
          assert.isString(res.body.text, 'text should be a string');
          assert.isUndefined(res.body.deleted_on, 'deleted_on should be undefined');

          const created_on = Date.parse(res.body.created_on);
          assert.isNotNaN(created_on, 'created_on should be a valid date');
          const bumped_on = Date.parse(res.body.bumped_on);
          assert.isNotNaN(bumped_on, 'bumped_on should be a valid date');

          assert.isArray(res.body.replies, 'replies should be an array');
          for (let reply of res.body.replies) {
            assert.match(reply._id, /^[\da-f]{24}$/, 'invalid replies._id');
            assert.isString(reply.text, 'replies.text should be a string');
            const created_on = Date.parse(reply.created_on);
            assert.isNotNaN(created_on, 'replies.created_on should be a valid date');
            assert.isUndefined(reply.deleted_on, 'replies.deleted_on should be undefined');
          }

          done();
        });
    });

    test('User can\'t request a deleted thread.', function (done) {
      chai
        .request(server)
        .delete("/api/threads/g")
        .send({ thread_id, delete_password })
        .end((err, res) => {
          if (err) throw err;
          chai
            .request(server)
            .get("/api/replies/g")
            .query({ thread_id })
            .end((err, res) => {
              if (err) throw err;
              assert.equal(res.status, 404, 'http status should be 404');
              assert.equal(res.text, 'no thread found', 'bad response text');
              done();
            });
        });
    });
  });

// I can report a reply and change it's reported value to true by sending a PUT
// request to /api/replies/{board} and pass along the thread_id & reply_id.
// (Text response will be 'success')
  suite('PUT', function() {

    let thread_id;
    let reply_id;
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(report reply) thread", delete_password: 'secret' })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          chai
            .request(server)
            .post("/api/replies/g")
            .send({ thread_id, text: "(reported) reply", delete_password: 'secret' })
            .end((err, res) => {
              if (err) throw err;
              chai
                .request(server)
                .get("/api/replies/g")
                .query({ thread_id })
                .end((err, res) => {
                  reply_id = res.body.replies[0]._id;
                  done();
                });
            });
        });
    });

    test('User can report a reply', function (done) {
      chai
        .request(server)
        .put("/api/replies/g")
        .send({ thread_id, reply_id })
        .end((err, res) => {
          assert.equal(res.status, 200, 'http status should be 200');
          assert.equal(res.text, 'success', 'response text should be \'success\'');
          done();
        });
    });

  });

// I can delete a post(just changing the text to '[deleted]') if I send a DELETE
// request to /api/replies/{board} and pass along the thread_id, reply_id, &
// delete_password. (Text response will be 'incorrect password' or 'success')
  suite('DELETE', function() {

    let thread_id;
    let reply_id;
    const delete_password = 'delete reply secret';
    suiteSetup(done => {
      chai
        .request(server)
        .post("/api/threads/g")
        .send({ text: "(delete reply) thread", delete_password: 'secret' })
        .end((err, res) => {
          if (err) throw err;
          const re = /^[^\/]*\/\/[^\/\?]*\/b\/g\/((?:\d|[a-f]){24})/;
          thread_id = res.redirects[0].match(re)[1];
          chai
            .request(server)
            .post("/api/replies/g")
            .send({ thread_id, text: "(deleted) reply", delete_password })
            .end((err, res) => {
              if (err) throw err;
              chai
                .request(server)
                .get("/api/replies/g")
                .query({ thread_id })
                .end((err, res) => {
                  reply_id = res.body.replies[0]._id;
                  done();
                });
            });
        });
    });

    test('User can delete a reply', function (done) {
      chai
        .request(server)
        .delete("/api/replies/g")
        .send({ thread_id, reply_id, delete_password })
        .end((err, res) => {
          assert.equal(res.status, 200, 'http status should be 200');
          assert.equal(res.text, 'success', 'bad response text');
          done();
        });
    });

    test('User can\'t access a deleted reply', function (done) {
      chai
        .request(server)
        .get("/api/replies/g")
        .query({ thread_id })
        .end((err, res) => {
          for (let reply of res.body.replies) {
            assert.isNotEqual(reply._id, reply_id, 'reply shouldn\'t be available');
          }
          done();
        });
    });

    test('User can\'t report a deleted reply', function (done) {
      chai
        .request(server)
        .put("/api/replies/g")
        .send({ thread_id, reply_id })
        .end((err, res) => {
          assert.equal(res.status, 404, 'http status should be 404');
          assert.equal(res.text, 'no reply reported', 'bad response text');
          done();
        });
    });

  });

  });

});
