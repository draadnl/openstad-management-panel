const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const host = process.env.MONGO_DB_HOST || 'localhost';
const port = process.env.MONGO_DB_PORT ||27017;
const MongoServer = new mongodb.Server(host, port);
const mongoBackup = require('mongodb-backup-4x');
const mongoRestore = require('mongodb-restore');
const url = 'mongodb://' + host + ':' + port;

function getConnectionString (database) {
  
  const dbPrefix = process.env.MONGO_DB_PREFIX ? process.env.MONGO_DB_PREFIX : '';
  
  // enforce dbPrefix for non-admin database
  if (dbPrefix && database !== "admin" && !database.startsWith(dbPrefix)) {
    database = (dbPrefix + database).substring(0, 63);
  }
  
  // Allow the connection string builder to be overridden by an environment variable
  // We replace '{database}' in this connection string with the database we are looking for
  if (process.env.MONGO_DB_CONNECTION_STRING) {
    return process.env.MONGO_DB_CONNECTION_STRING.replace('{database}', database);
  }
  
  const host = process.env.MONGO_DB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT_27017_TCP_PORT || process.env.MONGO_DB_PORT || 27017;
  const user = process.env.MONGO_DB_USER || '';
  const password = process.env.MONGO_DB_PASSWORD || '';
  const authSource = process.env.MONGO_DB_AUTHSOURCE || '';
  
  const useAuth = user && password;
  
  console.log ('mongodb connection string', `mongodb://${useAuth ? `${user}:${password}@` : ''}${host}:${port}/${database ? database : ''}${authSource ? `?authSource=${authSource}` : ''}`);
  
  return `mongodb://${useAuth ? `${user}:${password}@` : ''}${host}:${port}/${database ? database : ''}${authSource ? `?authSource=${authSource}` : ''}`;
}

exports.getConnectionString = getConnectionString;

function getPrefixedDbName(dbName) {
  const dbPrefix = process.env.MONGO_DB_PREFIX ? process.env.MONGO_DB_PREFIX : '';
  if (dbPrefix && !dbName.startsWith(dbPrefix)) {
    dbName = (dbPrefix + dbName).substring(0, 63);
  }
  return dbName;
}

exports.copyMongoDb = async (oldDbName, newDbName) => {
  
  oldDbName = getPrefixedDbName(oldDbName);
  newDbName = getPrefixedDbName(newDbName);
  
  const sourceConnection = new MongoClient(getConnectionString(oldDbName));
  const targetConnection = new MongoClient(getConnectionString(newDbName));
  
  if (!sourceConnection) {
    console.error('Source connection failed');
    throw new Error('Source connection failed');
  }
  
  if (!targetConnection) {
    console.error('Target connection failed');
    throw new Error('Target connection failed');
  }
  
  const collections = (
    await sourceConnection.db().listCollections().toArray()
  ).map((collection) => collection.name);

  if (!collections || collections.length === 0) {
    console.error('No collections found');
    return;
  }
  
  console.log (`copying ${oldDbName} to ${newDbName}`);
  console.log ('collections', collections);
  
  collections.map(async (collection) => {
    const count = await sourceConnection.db().collection(collection).countDocuments();
    
    const sourceCollection = sourceConnection
      .db()
      .collection(collection);
    
    const targetCollection = targetConnection
      .db()
      .collection(collection);
    
    if (count > 0) {
      console.log(`copying ${collection}`);
      await targetCollection.insertMany(
        await sourceCollection.find().toArray(),
        {
          ordered: false,
        }
      );
    }
  })
  
  console.log ('copy done');
  
  sourceConnection.close();
  targetConnection.close();
  
  return true;
  
}

exports.dbExists = (dbName) => {
  
  dbName = getPrefixedDbName(dbName);
  
  return new Promise((resolve, reject) => {
    const client = new MongoClient(getConnectionString('admin'));
    client.connect((err, client) => {
      if (err) {
        reject(err);
      } else {
        const adminDb = client.db("admin").admin();
        // List all the available databases
        adminDb.listDatabases(function(err, dbs) {
          const found = dbs.databases.find(dbObject => dbName === dbObject.name);
          client.close();
          resolve(!!found)
        });
      }
    });
  });
}

exports.deleteDb = (dbName) => {
  dbName = getPrefixedDbName(dbName);
  
  return new Promise((resolve, reject) => {
    const client = new MongoClient(getConnectionString('admin'));
    client.connect((err, mongoClient) => {
      if (err) {
        reject(err);
      } else {
        mongoClient.db(dbName).dropDatabase(function(err, result) {
          if(err) console.error(err);
          mongoClient.close();
        });

        resolve();
      }
    });
  });
}

exports.query = (dbName, collectionName) => {

  dbName = getPrefixedDbName(dbName);
  
  return new Promise((resolve, reject) => {

    const client = new MongoClient(getConnectionString(dbName));
    client.connect(url, function(err, mongoClient) {
      if (err) throw err;
      var db = mongoClient.db(dbName);
      db.collection(collectionName).find({}).toArray(function(err, result) {
        if (err) throw err;
        mongoClient.close();
        resolve(result)
      });
    });

  });

}

exports.export = (dbName, dirname) => {

  return new Promise((resolve, reject) => {

    let uri = url + '/' + dbName;
    dirname = dirname || './tmp';

    mongoBackup({
      uri: uri,
      root: dirname,
      callback: (err, result) => {
        resolve();
      }
    });


  });
}

exports.import = (dbName, dirname) => {

  return new Promise((resolve, reject) => {

    let uri = url + '/' + dbName;
    dirname = dirname || './tmp';

    mongoRestore({
      uri: uri,
      root: dirname,
      callback: (err, result) => {
        resolve();
      }
    });


  });
}
