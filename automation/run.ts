import "chromedriver";
import { Builder, ThenableWebDriver } from "selenium-webdriver";
import { generateToken } from "./totp";
import { GovUkOneLoginPage } from "./pages/GovUkOneLoginPage";
import { TestData } from "./TestData";
import { Options } from "selenium-webdriver/chrome";
import { screenshots } from "./screenshots";

async function runIvJourney(page: GovUkOneLoginPage, onPageChange: () => Promise<void>){

  await onPageChange();
  await page.clickOn("input[value='sign-in']");
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  await page.clickOn("input[type='radio'][name='havePhotoId'][value='true']");
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  await page.clickOn("#sign-in-link");

  await onPageChange();
  await page.inputText("input[name='email']", TestData.username);
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  await page.inputText("input[name='password']", TestData.password);
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  const code = generateToken(TestData.totpSecret);
  await page.inputText("input[name='code']", code);
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  await page.clickOn("button[name='submitButton']");

  await onPageChange();
  await page.clickOn("input[type='radio'][name='select-option'][value='no']");
  await page.clickOn("button[type='Submit']");

  await onPageChange();
  await page.clickOn("input[type='radio'][name='journey'][value='next']");
  await page.clickOn("button[name='submitButton']");

  await onPageChange();
  await page.inputText("input[name='passportNumber']", TestData.passportNumber);
  await page.inputText("input[name='surname']", TestData.surname);
  await page.inputText("input[name='firstName']", TestData.firstName);

  await page.inputText("input[name='dateOfBirth-day']", TestData.dateOfBirthDay);
  await page.inputText("input[name='dateOfBirth-month']", TestData.dateOfBirthMonth);
  await page.inputText("input[name='dateOfBirth-year']", TestData.dateOfBirthYear);

  await page.inputText("input[name='expiryDate-day']", TestData.passportExpiryDay);
  await page.inputText("input[name='expiryDate-month']", TestData.passportExpiryMonth);
  await page.inputText("input[name='expiryDate-year']", TestData.passportExpiryYear);

  await page.clickOn("button[name='submitButton']");

  await onPageChange();
  await page.inputText("input[name='addressSearch']", TestData.postcode);
  await page.clickOn("button[name='continue']");

  await onPageChange();
  await page.selectOption("select[name='addressResults']", TestData.address);
  await page.clickOn("button[name='continue']");

  await onPageChange();
  await page.inputText("input[name='addressYearFrom']", TestData.addressYearFrom);
  await page.clickOn("button[name='continue']");

  await onPageChange();
  await page.clickOn("button[data-id='next']");

  await onPageChange();
  await page.clickOn("button[name='continue']");

  //Answer security questions
  await onPageChange();
  await page.clickOn("button[name='submitButton']");

  while ((await page.getUrl()).endsWith("/kbv/question")) {
    // [Security question...]
    await onPageChange();
    await page.answerKbvQuestion(TestData.kbvAnswers);
    await page.clickOn("button[name='continue']");
  }

  // You’ve successfully proved your identity
  await onPageChange();
  await page.clickOn("button[name='submitButton']");
  
  // Returning you to the ‘...’ service
  await onPageChange();
  await page.waitToLeaveIpvCallback();
}

(async () => {

  // Run headless and record screenshots
  const options = new Options()
  .headless()
  .windowSize({
    height: 1800,
    width: 1024
  })

  const driver: ThenableWebDriver = new Builder()
  .forBrowser("chrome")
  .setChromeOptions(options)
  .build();

  const takeScreenshot = screenshots(driver, "./automation/.screenshots");
  const page = new GovUkOneLoginPage(driver);

  await page.navigateTo("http://localhost:3001/");
  await page.clickOn("a[href='/oauth/login']");
  await page.authenticate("integration-user", "winter2021");
  await page.rejectCookies();

  await runIvJourney(page, async () => {
    await takeScreenshot();
  });
  
  // Run the journey again
  await page.navigateTo("http://localhost:3001/");
  await page.clickOn("a[href='/oauth/login']");
  await runIvJourney(page, async () => {
    await takeScreenshot();
  });

  //await driver.quit();

  console.log("Finished");
})();
