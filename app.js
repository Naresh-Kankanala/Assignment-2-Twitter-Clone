const bcrypt = require("bcrypt");
const express = require("express");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API 1

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userExistenceQuery = `
                SELECT * 
                FROM user
                WHERE username = '${username}';`;
  const dbUser = await db.get(userExistenceQuery);
  if (dbUser === undefined) {
    if (password.length >= 6) {
      const registerUserQuery = `
                    INSERT INTO 
                        user(username, password, name, gender)
                    VALUES (
                        '${username}',
                        '${hashedPassword}',
                        '${name}',
                        '${gender}');`;
      const responseDB = await db.run(registerUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `
            SELECT * 
            FROM user
            WHERE username = '${username}';`;
  const responseDB = await db.get(checkUserQuery);
  if (responseDB === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      responseDB.password
    );
    if (isPasswordCorrect === true) {
      const payload = { username: username };
      JWTToken = jwt.sign(payload, "Naresh");
      response.send({ JWTToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication

const authenticateToken = (request, response, next) => {
  let JWTToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    JWTToken = authHeader.split(" ")[1];
  }
  if (JWTToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(JWTToken, "Naresh", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const tweetsQuery = `
            SELECT user.username AS username,
                    tweet.tweet AS tweet,
                    date_time AS dateTime
            FROM (user INNER JOIN follower ON user.user_id = follower.follower_id) AS combo
            INNER JOIN tweet ON combo.following_user_id = tweet.user_id
            WHERE user.name IN (SELECT name FROM user WHERE user_id IN (SELECT follower.following_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
            WHERE user.username = '${username}'))
            ORDER BY dateTime DESC
            LIMIT 4;`;
  const responseDB = await db.all(tweetsQuery);
  response.send(responseDB);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const followingQuery = `
            SELECT name FROM user WHERE user_id IN (SELECT follower.following_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
            WHERE user.username = '${username}');`;

  const responseDB = await db.all(followingQuery);
  response.send(responseDB);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const followerQuery = `
            SELECT name FROM user WHERE user_id IN (SELECT follower.follower_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
            WHERE user.username = '${username}');`;
  const responseDB = await db.all(followerQuery);
  response.send(responseDB);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id
                        FROM tweet
                        WHERE tweet_id = ${tweetId};`;
  const userId = await db.get(userIdQuery);
  const nameOfTweeterQuery = `SELECT name FROM user WHERE user_id = ${userId.user_id}`;
  const nameOfTweeter = await db.get(nameOfTweeterQuery);
  const followingQuery = `
            SELECT name FROM user WHERE user_id IN (SELECT follower.following_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
            WHERE user.username = '${username}');`;

  const responseDB = await db.all(followingQuery);
  let isValidToRequest = false;

  for (let item of responseDB) {
    if (item.name === nameOfTweeter.name) {
      isValidToRequest = true;
      break;
    }
  }

  if (isValidToRequest) {
    const tweetDetailsQuery = `SELECT tweet.tweet AS tweet,COUNT(DISTINCT(like.like_id)) AS likes, COUNT(DISTINCT(reply.reply)) AS replies, tweet.date_time AS dateTime
                                      FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS combo
                                      INNER JOIN like ON combo.tweet_id = like.tweet_id
                                      WHERE tweet.tweet_id = ${tweetId};`;
    const output = await db.get(tweetDetailsQuery);
    response.send(output);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id
                        FROM tweet
                        WHERE tweet_id = ${tweetId};`;
    const userId = await db.get(userIdQuery);
    const nameOfTweeterQuery = `SELECT name FROM user WHERE user_id = ${userId.user_id}`;
    const nameOfTweeter = await db.get(nameOfTweeterQuery);
    const followingQuery = `
            SELECT name FROM user WHERE user_id IN (SELECT follower.following_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
            WHERE user.username = '${username}');`;

    const responseDB = await db.all(followingQuery);
    let isValidToRequest = false;

    for (let item of responseDB) {
      if (item.name === nameOfTweeter.name) {
        isValidToRequest = true;
        break;
      }
    }

    if (isValidToRequest) {
      const likedUsersListQuery = `
                SELECT DISTINCT(user.username)
                FROM like NATURAL JOIN user
                WHERE user.user_id = ${userId.user_id};`;
      const responseDB = await db.all(likedUsersListQuery);
      let likes = [];
      for (let item of responseDB) {
        likes.push(item.username);
      }
      let likesObject = {
        likes: likes,
      };

      response.send(likesObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id
                        FROM tweet
                        WHERE tweet_id = ${tweetId};`;
    const userId = await db.get(userIdQuery);
    const nameOfTweeterQuery = `SELECT name FROM user WHERE user_id = ${userId.user_id}`;
    const nameOfTweeter = await db.get(nameOfTweeterQuery);
    const followingQuery = `
            SELECT name FROM user WHERE user_id IN (SELECT follower.following_user_id
            FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
            WHERE user.username = '${username}');`;

    const responseDB = await db.all(followingQuery);
    let isValidToRequest = false;

    for (let item of responseDB) {
      if (item.name === nameOfTweeter.name) {
        isValidToRequest = true;
        break;
      }
    }

    if (isValidToRequest) {
      const repliesListQuery = `
                SELECT DISTINCT(name),reply
                FROM reply INNER JOIN user ON reply.user_id = user.user_id
                WHERE reply.tweet_id = ${tweetId};`;
      const responseDB = await db.all(repliesListQuery);
      let replies = [];
      for (let item of responseDB) {
        replies.push(item);
      }
      let repliesObject = {
        replies: replies,
      };

      response.send(repliesObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userIdObject = await db.get(userIdQuery);
  const userId = userIdObject.user_id;
  const tweetsQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${userId};`;
  const tweetsQueryResponse = await db.all(tweetsQuery);
  let tweetIds = [];
  for (let item of tweetsQueryResponse) {
    tweetIds.push(item.tweet_id);
  }
  let outputList = [];
  for (let item of tweetIds) {
    const tweetDetailQuery = `SELECT tweet.tweet,COUNT(DISTINCT(like.like_id)) AS likes, COUNT(DISTINCT(reply.reply_id)) AS replies, tweet.date_time AS dateTime 
                                   FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS combo INNER JOIN like ON combo.tweet_id = like.tweet_id
                                   WHERE tweet.tweet_id = ${item};`;
    const tweet = await db.get(tweetDetailQuery);
    outputList.push(tweet);
  }
  response.send(outputList);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const postTweetQuery = `INSERT INTO tweet(tweet)
                               VALUES ('${tweet}');`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const queryForUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userIdObject = await db.get(queryForUserId);
    const userId = userIdObject.user_id;
    const tweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${userId};`;
    let tweetIdsResponse = await db.all(tweetIdsQuery);
    let tweetIds = [];
    for (let item of tweetIdsResponse) {
      tweetIds.push(item.tweet_id);
    }

    if (tweetIds.includes(tweetId)) {
      const deleteQuery = `DELETE FROM TWEET WHERE tweet_id = ${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
