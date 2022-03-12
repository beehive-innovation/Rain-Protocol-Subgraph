import { expect } from "chai";
import { hexlify } from "ethers/lib/utils";

import * as Util from "./utils/utils";
import {
  waitForSubgraphToBeSynced,
  getTxTimeblock,
  DEFAULT_ADMIN_ROLE,
  APPROVER_ADMIN,
  APPROVER,
  REMOVER_ADMIN,
  REMOVER,
  BANNER_ADMIN,
  BANNER,
  RequestType,
  RequestStatus,
  VerifyStatus,
  VerifyRole,
} from "./utils/utils";

// Types
import type { FetchResult } from "apollo-fetch";
import type { ContractTransaction } from "ethers";
import type { Verify } from "../typechain/Verify";

import {
  // Subgraph
  subgraph,
  // Signers
  deployer,
  signer1,
  signer2,
  admin,
  // Contracts factory
  verifyFactory,
  noticeBoard,
} from "./1_trustQueries.test";

let verify: Verify, transaction: ContractTransaction; // use to save/facilite a tx

const evidenceEmpty = hexlify([...Buffer.from("")]);
const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

// TODO Add more test queries when:
// - Approve, remove and ban are made in group
// - Request of add and msg.sender != account do not should change the state

describe("Verify Factory - Queries", function () {
  it("should query VerifyFactory correctly after construction", async function () {
    // Get the verify implementation
    const implementation = await Util.getImplementation(verifyFactory);

    const query = `
        {
          verifyFactories {
            id
            address
            implementation
          }
        }
      `;

    const queryResponse = (await subgraph({
      query,
    })) as FetchResult;

    const factoriesData = queryResponse.data.verifyFactories;
    const data = factoriesData[0];

    expect(factoriesData).to.have.lengthOf(1);

    expect(data.id).to.equals(verifyFactory.address.toLocaleLowerCase());
    expect(data.address).to.equals(verifyFactory.address.toLocaleLowerCase());
    expect(data.implementation).to.equals(implementation.toLocaleLowerCase());
  });

  describe("Verify contract -  Verification process", function () {
    let eventCounter = 0;
    let eventsSigner1 = 0;
    let eventsSigner2 = 0;
    let eventsAdmin = 0;
    it("should query the Verify child from factory after creation", async function () {
      verify = await Util.verifyDeploy(verifyFactory, deployer, admin.address);

      // Admin grants all roles to himself. This is for testing purposes only, it SHOULD be avoided.
      await verify.connect(admin).grantRole(APPROVER, admin.address);
      await verify.connect(admin).grantRole(REMOVER, admin.address);
      await verify.connect(admin).grantRole(BANNER, admin.address);

      await waitForSubgraphToBeSynced();

      const query = `
        {
          verifyFactory (id: "${verifyFactory.address.toLowerCase()}") {
            children {
              id
            }
          }
        }
      `;

      const queryVerifyFactoryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const data = queryVerifyFactoryResponse.data.verifyFactory;

      expect(data.children).to.deep.include({
        id: verify.address.toLowerCase(),
      });
    });

    it("should query the Verify contract correclty", async function () {
      // Using the deployTransaction
      const [deployBlock, deployTimestamp] = await getTxTimeblock(
        verify.deployTransaction
      );

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            address
            deployBlock
            deployTimestamp
            deployer
            factory {
              id
            }
            verifyAddresses {
              id
            }
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const data = queryResponse.data.verify;

      expect(data.verifyAddresses).to.be.not.empty;
      expect(data.address).to.equals(verify.address.toLowerCase());
      expect(data.factory.id).to.equals(verifyFactory.address.toLowerCase());

      expect(data.deployer).to.equals(deployer.address.toLowerCase());
      expect(data.deployBlock).to.equals(deployBlock.toString());
      expect(data.deployTimestamp).to.equals(deployTimestamp.toString());
    });

    it("should query Notice in Verify correctly", async function () {
      const notices = [
        {
          subject: verify.address,
          data: "0x01",
        },
      ];

      transaction = await noticeBoard.connect(signer1).createNotices(notices);

      const noticeId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - 0`;
      await waitForSubgraphToBeSynced();

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            notices {
              id
            }
          }
          notice (id: "${noticeId}") {
            sender
            subject{
              id
            }
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;
      const dataVerify = queryResponse.data.verify.notices;
      const dataNotice = queryResponse.data.notice;

      expect(dataVerify).deep.include({ id: noticeId });

      expect(dataNotice.sender).to.equals(signer1.address.toLowerCase());
      expect(dataNotice.subject.id).to.equals(verify.address.toLowerCase());
      expect(dataNotice.data).to.equals("0x01");
    });

    it("should query the VerifyRequestApprove after a RequestApprove", async function () {
      // signer1 want to be added
      transaction = await verify.connect(signer1).add(evidenceAdd);

      // Increase the counter by 1
      eventCounter++;
      eventsSigner1++;

      await waitForSubgraphToBeSynced();

      const requestId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyRequestApproves {
            id
          }
          verifyRequestApprove (id: "${requestId}"){
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataApproves = queryResponse.data.verifyRequestApproves;
      const data = queryResponse.data.verifyRequestApprove;

      expect(dataApproves).to.have.lengthOf(1);
      expect(dataApproves).to.deep.include({ id: requestId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer1.address.toLowerCase());
      expect(data.data).to.equals(evidenceAdd);
    });

    it("should query the VerifyEvent after a RequestApprove", async function () {
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${verifyEventId}") {
            block
            transactionHash
            timestamp
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataArray = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataArray).to.have.lengthOf(eventCounter);
      expect(dataArray).to.deep.include({ id: verifyEventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer1.address.toLowerCase());
      expect(data.data).to.equals(evidenceAdd);
    });

    it("should query the verifyAddress after RequestApprove from the Verify contract", async function () {
      const signer1Id = `${verify.address.toLowerCase()} - ${signer1.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        id: signer1Id,
        requestStatus: RequestStatus.APPROVE,
        status: VerifyStatus.ADDED,
      };

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            verifyAddresses {
              id
              requestStatus
              status
            }
          }
          verifyAddress (id: "${signer1Id}") {
            verifyContract {
              id
            }
            address
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataVerifyContract = queryResponse.data.verify.verifyAddresses;
      const data = queryResponse.data.verifyAddress;

      // Expected Verify contract values
      expect(dataVerifyContract).to.deep.include(expectedVerifyAddr);

      // Expected verifyAddress
      expect(data.verifyContract.id).to.equals(verify.address.toLowerCase());
      expect(data.address).to.equals(signer1.address.toLocaleLowerCase());

      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);
      expect(data.events).to.have.lengthOf(eventsSigner1);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should query the VerifyApprove after an Approve", async function () {
      const infoApprove = {
        account: signer1.address,
        data: evidenceApprove,
      };
      // Admin approve the signer1
      transaction = await verify.connect(admin).approve([infoApprove]);

      // Increase the counter by 1
      eventCounter++;
      eventsSigner1++;
      eventsAdmin++;

      await waitForSubgraphToBeSynced();

      const approveId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyApproves {
            id
          }
          verifyApprove (id: "${approveId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const dataApproves = response.data.verifyApproves;
      const data = response.data.verifyApprove;

      expect(dataApproves).to.have.lengthOf(1);
      expect(dataApproves).to.deep.include({ id: approveId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer1.address.toLowerCase());
      expect(data.data).to.equals(evidenceApprove);
    });

    it("should query the VerifyEvent after an Approve ", async function () {
      const eventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${eventId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataEvents = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataEvents).to.have.lengthOf(eventCounter);
      expect(dataEvents).to.deep.include({ id: eventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer1.address.toLowerCase());
      expect(data.data).to.equals(evidenceApprove);
    });

    it("should update the verifyAddress that has been Approve", async function () {
      const signer1Id = `${verify.address.toLowerCase()} - ${signer1.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        id: signer1Id,
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.APPROVED,
      };

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            verifyAddresses {
              id
              requestStatus
              status
            }
          }
          verifyAddress (id: "${signer1Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const dataVerifyContract = response.data.verify.verifyAddresses;
      const data = response.data.verifyAddress;

      // Expected Verify contract values
      expect(dataVerifyContract).to.deep.include(expectedVerifyAddr);

      // Expected VerifyAddress values
      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner1);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should update the verifyAddress that has Approved the user", async function () {
      const adminId = `${verify.address.toLowerCase()} - ${admin.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      // The admin address does not have any status because it is not called yet,
      // but should show his status
      const expectedVerifyAddr = {
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.NIL,
      };

      const query = `
        {
          verifyAddress (id: "${adminId}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
        `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      // Expected VerifyAddress values
      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsAdmin);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should query the VerifyRequestRemove after a RequestRemove", async function () {
      // signer2 requestAdd and admin approve
      const infoApprove = {
        account: signer2.address,
        data: evidenceApprove,
      };
      await verify.connect(signer2).add(evidenceEmpty);
      await verify.connect(admin).approve([infoApprove]);

      // This create 2 new verifyEvents that were already called
      // Then, increase the counter by 2
      eventCounter += 2;
      eventsAdmin++;
      eventsSigner2 += 2;

      // signer1 requests that signer2 be removed
      const infoRemove = {
        account: signer2.address,
        data: evidenceRemove,
      };
      transaction = await verify
        .connect(signer1)
        .request(RequestType.REMOVE, [infoRemove]);
      // Increase the counter by 1
      eventCounter++;

      // Both are involved
      eventsSigner1++;
      eventsSigner2++;

      await waitForSubgraphToBeSynced();

      const requestRemoveId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyRequestRemove (id: "${requestRemoveId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyRequestRemove;

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceRemove);
    });

    it("should query the VerifyEvent after a RequestRemove ", async function () {
      const eventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${eventId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataEvents = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataEvents).to.have.lengthOf(eventCounter);
      expect(dataEvents).to.deep.include({ id: eventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceRemove);
    });

    it("should update the verifyAddress that has a RequestRemove", async function () {
      const signer2Id = `${verify.address.toLowerCase()} - ${signer2.address.toLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        id: signer2Id,
        requestStatus: RequestStatus.REMOVE,
        status: VerifyStatus.APPROVED,
      };

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            verifyAddresses {
              id
              requestStatus
              status
            }
          }
          verifyAddress (id: "${signer2Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const dataVerifyContract = response.data.verify.verifyAddresses;
      const data = response.data.verifyAddress;

      // Expected Verify contract values
      expect(dataVerifyContract).to.deep.include(expectedVerifyAddr);

      // Expected VerifyAddress values
      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner2); // requestApprove, Approve and requestRemove
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should update the verifyAddress that call RequestRemove", async function () {
      const signer1Id = `${verify.address.toLowerCase()} - ${signer1.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const query = `
        {
          verifyAddress (id: "${signer1Id}") {
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      // Expected VerifyAddress values
      expect(data.events).to.have.lengthOf(eventsSigner1); // requestApprove, Approve and requestRemove
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should query the VerifyRemove after a Remove", async function () {
      // Admin remove the signer2
      const infoRemove = {
        account: signer2.address,
        data: evidenceRemove,
      };
      transaction = await verify.connect(admin).remove([infoRemove]);

      // Increase the counter by 1
      eventCounter++;
      eventsSigner2++;
      eventsAdmin++;

      await waitForSubgraphToBeSynced();

      const removeId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyRemove (id: "${removeId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyRemove;

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceRemove);
    });

    it("should query the VerifyEvent after a Remove ", async function () {
      const eventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${eventId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataEvents = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataEvents).to.have.lengthOf(eventCounter);
      expect(dataEvents).to.deep.include({ id: eventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceRemove);
    });

    it("should update the verifyAddress that has been Remove", async function () {
      const signer2Id = `${verify.address.toLowerCase()} - ${signer2.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        id: signer2Id,
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.NIL,
      };

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            verifyAddresses {
              id
              requestStatus
              status
            }
          }
          verifyAddress (id: "${signer2Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const dataVerifyContract = response.data.verify.verifyAddresses;
      const data = response.data.verifyAddress;

      // Expected Verify contract values
      expect(dataVerifyContract).to.deep.include(expectedVerifyAddr);

      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner2);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should update the verifyAddress  that has Removed the user", async function () {
      const adminId = `${verify.address.toLowerCase()} - ${admin.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const query = `
        {
          verifyAddress (id: "${adminId}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      // Expected VerifyAddress values
      expect(data.requestStatus).to.equals(RequestStatus.NONE);
      expect(data.status).to.equals(VerifyStatus.NIL);

      expect(data.events).to.have.lengthOf(eventsAdmin);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should query the VerifyRequestBan after a RequestBan", async function () {
      // signer2 request to be added again and admin approve
      const infoAdd = {
        account: signer2.address,
        data: evidenceEmpty,
      };
      await verify.connect(signer2).add(evidenceEmpty);
      await verify.connect(admin).approve([infoAdd]);
      // Then, increase the counter by 2
      eventCounter += 2;
      eventsAdmin++;
      eventsSigner2 += 2;

      // signer1 request signer2 to be banned
      const infoBan = {
        account: signer2.address,
        data: evidenceBan,
      };
      transaction = await verify
        .connect(signer1)
        .request(RequestType.BAN, [infoBan]);

      // Increase the counter by 1
      eventCounter++;

      // Both are involved
      eventsSigner1++;
      eventsSigner2++;

      await waitForSubgraphToBeSynced();

      const requestBanId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyRequestBan (id: "${requestBanId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyRequestBan;

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceBan);
    });

    it("should query the VerifyEvent after a RequestBan ", async function () {
      const eventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${eventId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataEvents = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataEvents).to.have.lengthOf(eventCounter);
      expect(dataEvents).to.deep.include({ id: eventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(signer1.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceBan);
    });

    it("should update the verifyAddress that has a RequestBan", async function () {
      const signer2Id = `${verify.address.toLowerCase()} - ${signer2.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        requestStatus: RequestStatus.BAN,
        status: VerifyStatus.APPROVED,
      };

      const query = `
        {
          verifyAddress (id: "${signer2Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner2);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should update the verifyAddress that call RequestBan", async function () {
      const signer1Id = `${verify.address.toLowerCase()} - ${signer1.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const query = `
        {
          verifyAddress (id: "${signer1Id}") {
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      // Expected VerifyAddress values
      expect(data.events).to.have.lengthOf(eventsSigner1);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should query the VerifyBan after a Ban", async function () {
      // Admin ban the signer2
      const infoBan = {
        account: signer2.address,
        data: evidenceBan,
      };
      transaction = await verify.connect(admin).ban([infoBan]);

      // Increase the counter by 1
      eventCounter++;
      eventsSigner2++;
      eventsAdmin++;

      await waitForSubgraphToBeSynced();

      const banId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;
      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyBan (id: "${banId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyBan;

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceBan);
    });

    it("should query the VerifyEvent after a Ban ", async function () {
      const eventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const [eventBlock, eventTimestamp] = await getTxTimeblock(transaction);

      const query = `
        {
          verifyEvents {
            id
          }
          verifyEvent (id: "${eventId}") {
            block
            timestamp
            transactionHash
            verifyContract
            sender
            account
            data
          }
        }
      `;

      const queryResponse = (await subgraph({
        query,
      })) as FetchResult;

      const dataEvents = queryResponse.data.verifyEvents;
      const data = queryResponse.data.verifyEvent;

      expect(dataEvents).to.have.lengthOf(eventCounter);
      expect(dataEvents).to.deep.include({ id: eventId });

      expect(data.block).to.equals(eventBlock.toString());
      expect(data.timestamp).to.equals(eventTimestamp.toString());
      expect(data.transactionHash).to.equals(transaction.hash.toLowerCase());

      expect(data.verifyContract).to.equals(verify.address.toLowerCase());
      expect(data.sender).to.equals(admin.address.toLowerCase());
      expect(data.account).to.equals(signer2.address.toLowerCase());
      expect(data.data).to.equals(evidenceBan);
    });

    it("should update the verifyAddress that has been Banned", async function () {
      const signer2Id = `${verify.address.toLowerCase()} - ${signer2.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        id: signer2Id,
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.BANNED,
      };

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            verifyAddresses {
              id
              requestStatus
              status
            }
          }
          verifyAddress (id: "${signer2Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const dataVerifyContract = response.data.verify.verifyAddresses;
      const data = response.data.verifyAddress;

      // Expected Verify contract values
      expect(dataVerifyContract).to.deep.include(expectedVerifyAddr);

      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner2);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should update the verifyAddress that has Banned the user", async function () {
      const signer2Id = `${verify.address.toLowerCase()} - ${signer2.address.toLocaleLowerCase()}`;
      const verifyEventId = `${verify.address.toLowerCase()} - ${transaction.hash.toLowerCase()} - ${eventCounter}`;

      const expectedVerifyAddr = {
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.BANNED,
      };

      const query = `
        {
          verifyAddress (id: "${signer2Id}") {
            requestStatus
            status
            events {
              id
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      // Expected VerifyAddress values
      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);

      expect(data.events).to.have.lengthOf(eventsSigner2);
      expect(data.events).to.deep.include({ id: verifyEventId });
    });

    it("should not change the VerifyAddress Banned status after approving a group of address", async function () {
      const approve1 = {
        account: signer1.address,
        data: evidenceApprove,
      };
      const approve2 = {
        account: signer2.address, // signer already banned
        data: evidenceApprove,
      };

      await verify.connect(admin).approve([approve1, approve2]);

      // Wait for sync
      await waitForSubgraphToBeSynced();

      const signerBannedId = `${verify.address.toLowerCase()} - ${signer2.address.toLocaleLowerCase()}`;

      const expectedVerifyAddr = {
        id: signerBannedId,
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.BANNED,
      };

      const query = `
        {
          verifyAddress (id: "${signerBannedId}") {
            requestStatus
            status
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      expect(data.requestStatus).to.equals(expectedVerifyAddr.requestStatus);
      expect(data.status).to.equals(expectedVerifyAddr.status);
    });
  });

  describe("Verify contract - Roles", function () {
    let adminVerifyAddress: string,
      signer1VerifyAddress: string,
      signer2VerifyAddress: string;

    before("deplopy new verify", async function () {
      verify = await Util.verifyDeploy(verifyFactory, deployer, admin.address);

      adminVerifyAddress = admin.address.toLowerCase();
      signer1VerifyAddress = signer1.address.toLowerCase();
      signer2VerifyAddress = signer2.address.toLowerCase();

      // Wait for sync
      await waitForSubgraphToBeSynced();
    });

    it("should query the Initial Roles in the Verify after creation", async function () {
      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            approvers{
              address
            }
            removers{
              address
            }
            banners{
              address
            }
            approverAdmins{
              address
            }
            bannerAdmins{
              address
            }
            removerAdmins{
              address
            }
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verify;

      expect(data.approvers, `ERROR: approvers NOT granted yet`).to.be.empty;
      expect(data.removers, `ERROR: removers NOT granted yet`).to.be.empty;
      expect(data.banners, `ERROR: banners NOT granted yet`).to.be.empty;

      expect(data.approverAdmins).to.deep.include(
        { address: adminVerifyAddress },
        `wrong initial rol status: admin have the initial approveAdmin rol`
      );
      expect(data.bannerAdmins).to.deep.include(
        { address: adminVerifyAddress },
        `wrong initial rol status: admin have the initial bannerAdmin rol`
      );
      expect(data.removerAdmins).to.deep.include(
        { address: adminVerifyAddress },
        `wrong initial rol status: admin have the initial removerAdmin rol`
      );
    });

    it("should query admin VerifyAddress with the correct roles after Verify creation", async function () {
      const expectedRoles = [
        VerifyRole.APPROVER_ADMIN,
        VerifyRole.REMOVER_ADMIN,
        VerifyRole.BANNER_ADMIN,
      ];

      const expectedVerifyAddr = {
        requestStatus: RequestStatus.NONE,
        status: VerifyStatus.NIL,
        roles: expectedRoles,
      };

      const query = `
        {
          verifyAddress (id: "${verify.address.toLowerCase()} - ${adminVerifyAddress}") {
            status
            requestStatus
            roles
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      expect(data.status).to.equals(
        expectedVerifyAddr.status,
        `wrong status - admin verify adress does not have a status`
      );

      expect(data.requestStatus).to.equals(
        expectedVerifyAddr.requestStatus,
        `wrong status - admin verify adress has not made a request`
      );

      expect(data.roles).to.eql(
        expectedRoles.map((role) => role.toString()),
        `wrong roles in verify address
        expected  ${expectedRoles}
        got       ${data.roles}`
      );
    });

    it("should update admin Roles in the Verify after grant new Admins", async function () {
      // Admin grants admin roles
      // Signer1 as Approver Admin
      await verify
        .connect(admin)
        .grantRole(await verify.APPROVER_ADMIN(), signer1.address);

      // Signer2 as Remover and Banner Admin
      await verify
        .connect(admin)
        .grantRole(await verify.REMOVER_ADMIN(), signer2.address);
      await verify
        .connect(admin)
        .grantRole(await verify.BANNER_ADMIN(), signer2.address);

      await waitForSubgraphToBeSynced();

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            approverAdmins{
              address
            }
            bannerAdmins{
              address
            }
            removerAdmins{
              address
            }
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verify;

      expect(data.approverAdmins).to.deep.include(
        { address: signer1VerifyAddress },
        `approvers admins does include the new approver verify address "${signer1VerifyAddress}"`
      );
      expect(data.bannerAdmins).to.deep.include(
        { address: signer2VerifyAddress },
        `banner adminss does include the new banner verify address "${signer2VerifyAddress}"`
      );
      expect(data.removerAdmins).to.deep.include(
        { address: signer2VerifyAddress },
        `remover admins does include the new remover verify address "${signer2VerifyAddress}"`
      );
    });

    it("should update Verify after renounce an admin Role", async function () {
      // defaultAdmin leaves their roles. This removes a big risk
      await verify.connect(admin).renounceRole(APPROVER_ADMIN, admin.address);
      await verify.connect(admin).renounceRole(REMOVER_ADMIN, admin.address);
      await verify.connect(admin).renounceRole(BANNER_ADMIN, admin.address);
      await verify
        .connect(admin)
        .renounceRole(DEFAULT_ADMIN_ROLE, admin.address);

      await waitForSubgraphToBeSynced();

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            approverAdmins{
              address
            }
            bannerAdmins{
              address
            }
            removerAdmins{
              address
            }
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verify;

      expect(data.approverAdmins).to.not.deep.include(
        { address: adminVerifyAddress },
        `wrong query: admin has not been removed from approverAdmins after leaving role`
      );
      expect(data.bannerAdmins).to.not.deep.include(
        { address: adminVerifyAddress },
        `wrong query: admin has not been removed from bannerAdmins after leaving role`
      );
      expect(data.removerAdmins).to.not.deep.include(
        { address: adminVerifyAddress },
        `wrong query: admin has not been removed from removerAdmins after leaving role`
      );
    });

    it("should query admin VerifyAddress with the correct roles after Verify creation", async function () {
      const expectedRoles: VerifyRole[] = [];

      const query = `
        {
          verifyAddress (id: "${verify.address.toLowerCase()} - ${adminVerifyAddress}") {
            roles
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data = response.data.verifyAddress;

      expect(data.roles).to.eql(
        expectedRoles,
        `wrong roles in verify address
        expected  ${expectedRoles}
        got       ${data.roles}`
      );
    });

    it("should add admin roles to VerifyAddress after grant role", async function () {
      // Expected roles
      const signer1RolesExpected = [VerifyRole.APPROVER_ADMIN];
      const signer2RolesExpected = [
        VerifyRole.REMOVER_ADMIN,
        VerifyRole.BANNER_ADMIN,
      ];

      const query = `
        {
          verifyAddress1: verifyAddress (id: "${verify.address.toLowerCase()} - ${signer1VerifyAddress}") {
            roles
          }
          verifyAddress2: verifyAddress (id: "${verify.address.toLowerCase()} - ${signer2VerifyAddress}") {
            roles
          }
        }
      `;
      const response = (await subgraph({
        query,
      })) as FetchResult;
      const data1 = response.data.verifyAddress1;
      const data2 = response.data.verifyAddress2;

      expect(data1.roles).to.eql(
        signer1RolesExpected.map((role) => role.toString()),
        `signer1 verify address does not have the approverAdmin role`
      );

      expect(data2.roles).to.eql(
        signer2RolesExpected.map((role) => role.toString()),
        `signer2RolesExpectedsigner2 verify address does not have the removerAdmin and bannerAdmin roles`
      );
    });

    it("should update the Verify after grant roles", async function () {
      // Signer1 grant as Approver to himself
      await verify.connect(signer1).grantRole(APPROVER, signer1.address);

      // Signer2 grant as Remover
      await verify.connect(signer2).grantRole(REMOVER, signer2.address);

      // Signer2 grant as Banner to Signer1
      await verify.connect(signer2).grantRole(BANNER, signer1.address);

      await waitForSubgraphToBeSynced();

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            approvers{
              address
            }
            banners{
              address
            }
            removers{
              address
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;

      const data = response.data.verify;

      expect(data.approvers).to.deep.include(
        { address: signer1VerifyAddress },
        `approvers in verify doest include the approver verifyAddress ${signer1VerifyAddress}`
      );
      expect(data.banners).to.deep.include(
        { address: signer1VerifyAddress },
        `banners in verify doest include the banner verifyAddress ${signer1VerifyAddress}`
      );

      expect(data.removers).deep.include(
        { address: signer2VerifyAddress },
        `removers in verify doest include the remover verifyAddress ${signer2VerifyAddress}`
      );
    });

    it("should update  the Verify after revoke a role", async function () {
      // Signer2 revoke as Banner to Signer1
      await verify.connect(signer2).revokeRole(BANNER, signer1.address);

      await waitForSubgraphToBeSynced();

      const query = `
        {
          verify (id: "${verify.address.toLowerCase()}") {
            banners {
              address
            }
          }
        }
      `;

      const response = (await subgraph({
        query,
      })) as FetchResult;

      const data = response.data.verify;

      expect(data.banners).to.not.deep.include(
        { address: signer1VerifyAddress },
        `wrong: verifyAddress has not been remove from banners after revoking their role`
      );
    });
  });
});
