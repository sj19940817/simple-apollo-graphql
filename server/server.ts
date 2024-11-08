import express from 'express';
import { ApolloServer, gql, ServerRegistration } from 'apollo-server-express';
import { PubSub } from 'graphql-subscriptions';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

import { createServer } from 'http';

const pubsub = new PubSub();
const RESOURCE_ADDED = 'RESOURCE_ADDED';

interface Resource {
  id: string;
  name: string;
  type: string;
  region: string;
}

let resources: Resource[] = [
  { id: '1', name: 'Compute Engine', type: 'VM', region: 'us-central1' },
  { id: '2', name: 'Cloud Storage', type: 'Storage', region: 'europe-west1' },
];

const typeDefs = gql`
  type Resource {
    id: ID!
    name: String!
    type: String!
    region: String!
  }

  type Query {
    resources(filter: String): [Resource]
  }

  type Subscription {
    resourceAdded: Resource
  }

  type Mutation {
    addResource(name: String!, type: String!, region: String!): Resource
  }
`;

const resolvers = {
  Query: {
    resources: (_: any, { filter }: { filter?: string }) => {
      if (filter) {
        return resources.filter((resource) =>
          resource.name.toLowerCase().includes(filter.toLowerCase())
        );
      }
      return resources;
    },
  },
  Mutation: {
    addResource: (_: any, { name, type, region }: { name: string; type: string; region: string }) => {
      console.log(name, type, region)
      const newResource: Resource = { id: `${resources.length + 1}`, name, type, region };
      resources.push(newResource);
      pubsub.publish(RESOURCE_ADDED, { resourceAdded: newResource });
      return newResource;
    },
  },
  Subscription: {
    resourceAdded: {
      subscribe: () => pubsub.asyncIterator([RESOURCE_ADDED]),
    },
  },
};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const apolloServer = new ApolloServer({
    schema,
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app } as ServerRegistration);

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  useServer({ schema }, wsServer);

  const PORT = 4000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`🚀 Subscriptions are running on ws://localhost:${PORT}/graphql`);
  });
}

startServer();