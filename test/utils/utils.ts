import {
  Contract,
  Signer,
  BigNumber,
  ContractTransaction,
  BytesLike,
  Overrides
} from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Result, concat, hexlify, Hexable, zeroPad } from "ethers/lib/utils";
import { createApolloFetch, ApolloFetch } from "apollo-fetch";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Artifact } from "hardhat/types";

// Balancer contracts
import BFactory from "@beehiveinnovation/balancer-core/artifacts/BFactory.json";
import SmartPoolManager from "@beehiveinnovation/configurable-rights-pool/artifacts/SmartPoolManager.json";
import BalancerSafeMath from "@beehiveinnovation/configurable-rights-pool/artifacts/BalancerSafeMath.json";
import RightsManager from "@beehiveinnovation/configurable-rights-pool/artifacts/RightsManager.json";
import CRPFactory from "@beehiveinnovation/configurable-rights-pool/artifacts/CRPFactory.json";
import ConfigurableRightsPoolJson from "@beehiveinnovation/configurable-rights-pool/artifacts/ConfigurableRightsPool.json";
import BPoolJson from "@beehiveinnovation/configurable-rights-pool/artifacts/BPool.json";

// Rain protocol contracts Artifacts
import RedeemableERC20FactoryJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/redeemableERC20/RedeemableERC20Factory.sol/RedeemableERC20Factory.json";
import SeedERC20FactoryJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/seed/SeedERC20Factory.sol/SeedERC20Factory.json";
import TrustFactoryJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/trust/TrustFactory.sol/TrustFactory.json";
import TrustJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/trust/Trust.sol/Trust.json";
import SaleJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/sale/Sale.sol/Sale.json";
import verifyJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/verify/Verify.sol/Verify.json";

// Types
import { ERC20BalanceTierFactory } from "@beehiveinnovation/rain-protocol/typechain/ERC20BalanceTierFactory";
import { ERC20TransferTierFactory } from "@beehiveinnovation/rain-protocol/typechain/ERC20TransferTierFactory";
import { CombineTierFactory } from "@beehiveinnovation/rain-protocol/typechain/CombineTierFactory";
import { VerifyTierFactory } from "@beehiveinnovation/rain-protocol/typechain/VerifyTierFactory";
import { VerifyFactory } from "@beehiveinnovation/rain-protocol/typechain/VerifyFactory";

import { RedeemableERC20Factory } from "@beehiveinnovation/rain-protocol/typechain/RedeemableERC20Factory";
import { SeedERC20Factory } from "@beehiveinnovation/rain-protocol/typechain/SeedERC20Factory";
import { TrustFactory } from "@beehiveinnovation/rain-protocol/typechain/TrustFactory";
import { SaleFactory } from "@beehiveinnovation/rain-protocol/typechain/SaleFactory";

import { ERC20BalanceTier } from "@beehiveinnovation/rain-protocol/typechain/ERC20BalanceTier";
import { ERC20TransferTier } from "@beehiveinnovation/rain-protocol/typechain/ERC20TransferTier";
import { CombineTier } from "@beehiveinnovation/rain-protocol/typechain/CombineTier";
import { VerifyTier } from "@beehiveinnovation/rain-protocol/typechain/VerifyTier";
import { Verify } from "@beehiveinnovation/rain-protocol/typechain/Verify";

import type { ConfigurableRightsPool } from "@beehiveinnovation/rain-protocol/typechain/ConfigurableRightsPool";
import type { BPool } from "@beehiveinnovation/rain-protocol/typechain/BPool";
import type {
  Trust,
  TrustConfigStruct,
  TrustRedeemableERC20ConfigStruct,
  TrustSeedERC20ConfigStruct,
} from "@beehiveinnovation/rain-protocol/typechain/Trust";

import type {
  Sale,
  SaleConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "@beehiveinnovation/rain-protocol/typechain/Sale";

interface SyncedSubgraphType {
  synced: boolean;
}

const { ethers } = require("hardhat");

export const sixZeros = "000000";
export const sixteenZeros = "0000000000000000";
export const eighteenZeros = "000000000000000000";

export const zeroAddress = ethers.constants.AddressZero;

export const ONE = ethers.BigNumber.from("1" + eighteenZeros);
export const RESERVE_ONE = ethers.BigNumber.from("1" + sixZeros);

export const CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING = 100;
export const MAX_RAISE_DURATION_TESTING = 100;

export enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

export interface VMState {
  sources: Uint8Array[];
  constants: BigNumber[];
  stackLength: number;
  argumentsLength: number;
}

interface State {
  stackIndex: BigNumber;
  stack: BigNumber[];
  sources: BytesLike[];
  constants: BigNumber[];
  arguments: BigNumber[];
}

interface CRPLibraries {
  [key: string]: string;
  SmartPoolManager: string;
  BalancerSafeMath: string;
  RightsManager: string;
}

interface BasicArtifact {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any[];
  bytecode: string;
}

export const LEVELS = Array.from(Array(8).keys()).map((value) =>
  ethers.BigNumber.from(++value + eighteenZeros).toString()
); // [1,2,3,4,5,6,7,8]

// Execute Child Processes
const srcDir = path.join(__dirname, "..");
export const exec = (cmd: string): string | Buffer => {
  try {
    return execSync(cmd, { cwd: srcDir, stdio: "inherit" });
  } catch (e) {
    throw new Error(`Failed to run command \`${cmd}\``);
  }
};

// Subgraph Management
export const fetchSubgraphs = createApolloFetch({
  uri: "http://localhost:8030/graphql",
});

export const fetchSubgraph = (subgraphUser: string, subgraphName: string): ApolloFetch => {
  return createApolloFetch({
    uri: `http://localhost:8000/subgraphs/name/${subgraphUser}/${subgraphName}`,
  });
};

export const waitForSubgraphToBeSynced = async (delay: number): Promise<SyncedSubgraphType> =>
  new Promise<{ synced: boolean }>((resolve, reject) => {
    // Wait for 5s
    const deadline = Date.now() + 15 * 1000;

    // Function to check if the subgraph is synced
    const checkSubgraphSynced = async () => {
      try {
        const result = await fetchSubgraphs({
          query: `{
            indexingStatusForCurrentVersion(subgraphName: "vishalkale151071/rain-protocol") {
              synced
              health
              fatalError{
                message
                handler
              }
            } 
          }`,
        });
        if (result.data.indexingStatusForCurrentVersion.synced === true) {
          resolve({ synced: true });
        } else {
          throw new Error("reject or retry");
        }
      } catch (e) {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for the subgraph to sync`));
        } else {
          setTimeout(checkSubgraphSynced, delay);
        }
      }
    };

    // Periodically check whether the subgraph has synced
    setTimeout(checkSubgraphSynced, delay);
  });

// Contracts Management
export const deploy = async (
  artifact: Artifact | BasicArtifact,
  signer: SignerWithAddress,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argmts: any[] | any
): Promise<Contract> => {
  const iface = new ethers.utils.Interface(artifact.abi);
  const factory = new ethers.ContractFactory(iface, artifact.bytecode, signer);
  const contract = await factory.deploy(...argmts);
  await contract.deployed();
  return contract;
};

export const balancerDeploy = async (
  signer: SignerWithAddress
): Promise<[Contract, Contract]> => {
  const bFactory: Contract = await deploy(BFactory, signer, []);

  const smartPoolManager: Contract = await deploy(SmartPoolManager, signer, []);
  const balancerSafeMath: Contract = await deploy(BalancerSafeMath, signer, []);
  const rightsManager: Contract = await deploy(RightsManager, signer, []);

  const libs: CRPLibraries = {
    SmartPoolManager: smartPoolManager.address,
    BalancerSafeMath: balancerSafeMath.address,
    RightsManager: rightsManager.address,
  };
  const crpFactory: Contract = await deploy(
    linkBytecode(CRPFactory, libs),
    signer,
    []
  );
  return [crpFactory, bFactory];
};

const linkBytecode = (artifact: Artifact | BasicArtifact, links: CRPLibraries) => {
  Object.keys(links).forEach((libraryName) => {
    const libraryAddress = links[libraryName];
    const regex = new RegExp(`__${libraryName}_+`, "g");
    artifact.bytecode = artifact.bytecode.replace(
      regex,
      libraryAddress.replace("0x", "")
    );
  });
  return artifact;
};

export const factoriesDeploy = async (
  crpFactory: Contract,
  balancerFactory: Contract,
  signer: SignerWithAddress
): Promise<{
  redeemableERC20Factory: RedeemableERC20Factory;
  seedERC20Factory: SeedERC20Factory;
  trustFactory: TrustFactory;
 }> => {
  const redeemableERC20Factory = await deploy(
    RedeemableERC20FactoryJson,
    signer,
    []
  ) as RedeemableERC20Factory;

  const seedERC20Factory = await deploy(SeedERC20FactoryJson, signer, []) as SeedERC20Factory;

  const TrustFactoryArgs = {
    redeemableERC20Factory: redeemableERC20Factory.address,
    seedERC20Factory: seedERC20Factory.address,
    crpFactory: crpFactory.address,
    balancerFactory: balancerFactory.address,
    creatorFundsReleaseTimeout: CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING,
    maxRaiseDuration: MAX_RAISE_DURATION_TESTING,
  };

  const iface = new ethers.utils.Interface(TrustFactoryJson.abi);
  const trustFactoryFactory = new ethers.ContractFactory(
    iface,
    TrustFactoryJson.bytecode,
    signer
  );
  const trustFactory = await trustFactoryFactory.deploy(TrustFactoryArgs) as TrustFactory;
  await trustFactory.deployed();
  return {
    redeemableERC20Factory,
    seedERC20Factory,
    trustFactory,
  };
};

/**
 * @param trustFactory - the TrustFactory that will create the child.
 * @param creator - The signer that will create the child and will be connected to
 * @param trustConfig - the trust configuration
 * @param trustRedeemableERC20Config - the Redeemable configuration of this Trust
 * @param trustSeedERC20Config -the Seed configuration of this Trust
 * @param override - (optional) an object that contain properties to edit in the call. For ex: gasLimit or value
 * @returns The trust child
 */
export const trustDeploy = async (
  trustFactory: TrustFactory,
  creator: SignerWithAddress,
  trustConfig: TrustConfigStruct,
  trustRedeemableERC20Config: TrustRedeemableERC20ConfigStruct,
  trustSeedERC20Config: TrustSeedERC20ConfigStruct,
  override: Overrides = {}
): Promise<Trust> => {
  // Creating the trust contract child
  const trust = (await createChildTyped(
    trustFactory,
    TrustJson,
    [trustConfig, trustRedeemableERC20Config, trustSeedERC20Config, override],
    creator
  )) as Trust & Contract;

  return trust;
};

/**
 * @param saleFactory - the SaleFactory that will create the child.
 * @param creator - The signer that will create the child and will be connected to
 * @param saleConfig - the sale configuration
 * @param saleRedeemableERC20Config - the Redeemable configuration of this Sale
 * @param override - (optional) an object that contain properties to edit in the call. For ex: gasLimit or value
 * @returns The sale child
 */
export const saleDeploy = async (
  saleFactory: SaleFactory,
  creator: SignerWithAddress,
  saleConfig: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  override: Overrides = {}
): Promise<Sale> => {
  // Creating the sale contract child
  const sale = (await createChildTyped(
    saleFactory,
    SaleJson,
    [saleConfig, saleRedeemableERC20Config, override],
    creator
  )) as Sale & Contract;

  return sale;
};

/**
 * @param verifyFactory - The Verify Factory
 * @param creator - the signer that will create the Verify
 * @param adminAddress - the verify admin address
 * @param override - (optional) override transaction values as gasLimit
 * @returns 
 */
export const verifyDeploy = async (
  verifyFactory: VerifyFactory,
  creator: SignerWithAddress,
  adminAddress: string,
  override: Overrides = {}
): Promise<Verify> => {
  // Creating child
  const verify = (await createChildTyped(
    verifyFactory,
    verifyJson,
    [adminAddress, override],
    creator
  )) as Verify & Contract;

  return verify;
};

export const verifyTierDeploy = async (
  verifyTierFactory: VerifyTierFactory,
  creator: SignerWithAddress,
  verifyAddress: string,
  override: Overrides = {}
): Promise<VerifyTier> => {
  // Creating child
  const verifyTier = (await createChildTyped(
    verifyTierFactory,
    verifyJson,
    [verifyAddress, override],
    creator
  )) as VerifyTier & Contract;

  return verifyTier;
};

/**
 * @param factory - the factory that contain the `createChildTyped()` function to create a child.
 * @param childtArtifact - the child artifact that will be created.
 * @param args - the arguments necessaries to create the child. Should be passed inside an array.
 * @param creator - (optional) the signer that will create the child and will be connected to. Same as contractFactory if not provided
 * @returns The child contract connected to the signer
 */
export const createChildTyped = async (
  factory: Contract,
  childtArtifact: Artifact,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  creator: SignerWithAddress = null
): Promise<Contract> => {
  factory = creator === null ? factory : factory.connect(creator);
  const txDeploy = await factory.createChildTyped(...args);

  const child = (await getContractChild(
    txDeploy,
    factory,
    childtArtifact,
    creator
  )) as Contract;

  return child;
};

export const poolContracts = async (
  signer: Signer | SignerWithAddress,
  trust: Trust & Contract
): Promise<{
  crp: ConfigurableRightsPool & Contract;
  bPool: BPool & Contract;
}> => {
  const crp = new ethers.Contract(
    await trust.crp(),
    ConfigurableRightsPoolJson.abi,
    signer
  ) as ConfigurableRightsPool & Contract;
  const bPool = new ethers.Contract(
    await crp.bPool(),
    BPoolJson.abi,
    signer
  ) as BPool & Contract;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  crp.deployTransaction = trust.deployTransaction;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  bPool.deployTransaction = trust.deployTransaction;

  return { crp, bPool };
};

export const waitForBlock = async (blockNumber: number): Promise<void> => {
  const currentBlock = await ethers.provider.getBlockNumber();

  if (currentBlock >= blockNumber) {
    return;
  }

  console.log({
    currentBlock,
    awaitingBlock: blockNumber,
  });

  await timeout(2000);

  return await waitForBlock(blockNumber);
};

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export const fetchFile = (_path: string): string  => {
  try {
    return fs.readFileSync(_path).toString();
  } catch (error) {
    console.log(error);
    return "";
  }
};

// eslint-disable-next-line
export const writeFile = (_path: string, file: any): void => {
  try {
    fs.writeFileSync(_path, file);
  } catch (error) {
    console.log(error);
  }
};

/**
 *
 * @param tx - transaction where event occurs
 * @param eventName - name of event
 * @param contract - contract object holding the address, filters, interface
 * @param contractAddressOverride - (optional) override the contract address which emits this event
 * @returns Event arguments, can be deconstructed by array index or by object key
 */
export const getEventArgs = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract,
  contractAddressOverride: string = null
): Promise<Result> => {
  const eventObj = (await tx.wait()).events.find(
    (x) =>
      x.topics[0] === contract.filters[eventName]().topics[0] &&
      x.address === (contractAddressOverride || contract.address)
  );

  if (!eventObj) {
    throw new Error(`Could not find event with name ${eventName}`);
  }

  return contract.interface.decodeEventLog(eventName, eventObj.data);
};

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const wait = 1000;

export const createEmptyBlock = async (count?: number): Promise<void> => {
  const signers = await ethers.getSigners();
  const tx = { to: signers[1].address };
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      await signers[0].sendTransaction(tx);
    }
  } else {
    await signers[0].sendTransaction(tx);
  }
};

/**
 *
 * @param tx - transaction where the child was created
 * @param contractFactory - contract factory that create the child
 * @param contractArtifact - the artifact of the child contract
 * @param signer - (optional) the signer that will be connected the child contract. Same as contractFactory if not provided
 * @param eventName - (optional) the event where the address was emitted. By default "NewChild"
 * @param eventArg - (optional) the arg of the event that contain the address. By default "child"
 * @returns The child contract connected to the signer
 */
export const getContractChild = async (
  tx: ContractTransaction,
  contractFactory: Contract,
  contractArtifact: Artifact,
  signer?: SignerWithAddress,
  eventName = "NewChild",
  eventArg = "child"
): Promise<Contract> => {
  const contractChild = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, eventName, contractFactory))[eventArg]
      ),
      20 // address bytes length
    ),
    contractArtifact.abi,
    signer || contractFactory.signer
  ) as Contract;

  if (!ethers.utils.isAddress(contractChild.address)) {
    throw new Error(
      `invalid trust address: ${contractChild.address} (${contractChild.address.length} chars)`
    );
  }

  await contractChild.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  contractChild.deployTransaction = tx;

  return contractChild;
};

/**
 * Converts a value to raw bytes representation. Assumes `value` is less than or equal to 1 byte, unless a desired `bytesLength` is specified.
 *
 * @param value - value to convert to raw bytes format
 * @param bytesLength - (defaults to 1) number of bytes to left pad if `value` doesn't completely fill the desired amount of memory. Will throw `InvalidArgument` error if value already exceeds bytes length.
 * @returns {Uint8Array} - raw bytes representation
 */
export function bytify(
  value: number | BytesLike | Hexable,
  bytesLength = 1
): BytesLike {
  return zeroPad(hexlify(value), bytesLength);
}

/**
 * Converts an opcode and operand to bytes, and returns their concatenation.
 * @param code - the opcode
 * @param erand - the operand, currently limited to 1 byte (defaults to 0)
 */
export function op(code: number, erand = 0): Uint8Array {
  return concat([bytify(code), bytify(erand)]);
}

export function encodeStateExpected(vmStateConfig: VMState): State {
  const stackIndex = ethers.BigNumber.from(0);
  const stack = new Array(vmStateConfig.stackLength).fill(
    ethers.BigNumber.from(0)
  );
  const sources = vmStateConfig.sources.map((x) => ethers.utils.hexlify(x));
  const constants = vmStateConfig.constants.map((x) =>
    ethers.BigNumber.from(x)
  );
  const args = new Array(vmStateConfig.argumentsLength).fill(
    ethers.BigNumber.from(0)
  );
  return {
    stackIndex: stackIndex,
    stack: stack,
    sources: sources,
    constants: constants,
    arguments: args,
  };
}

export const getTxTimeblock = async (
  tx: ContractTransaction
): Promise<[number, number]> => {
  const block = tx.blockNumber;
  const timestamp = (await ethers.provider.getBlock(block)).timestamp;
  return [block, timestamp];
};
