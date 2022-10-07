import { By, ThenableWebDriver, WebElement } from "selenium-webdriver";
import { findWebElement } from "../web-elements";
import { PageBase } from "./PageBase";

export class GovUkOneLoginPage extends PageBase {

  constructor(driver: ThenableWebDriver) {
    super(driver);
  }
  
  async answerKbvQuestion(answers: { [questionId: string]: number | string }) {
    const fieldset = await this.driver.findElement(
      By.css("form[action='/kbv/question'] fieldset.govuk-fieldset")
    );
    const fieldsetId = await fieldset.getAttribute("id");
    const questionId = fieldsetId.replace(/\-.+$/, "");
    const answer = answers[questionId];
    const answerRadios = await fieldset.findElements(By.name(questionId));

    // Rind the radio input that matches the answer
    const answerRadio = await findWebElement(
      answerRadios,
      async (radio: WebElement) => {
        const value = await radio.getAttribute("value");
        
        // Exact match
        if (value.replace(/^\s*|\s*$|£/gi, "") === answer.toString()) {
          return true;
        }

        // Range
        if (typeof answer === "number") {
          const match = /^(?:OVER £?([\d,]+) )?UP TO £?([\d,]+)$/.exec(value);
          if (match !== null) {
            const min = Number.parseFloat((match[1] || "0").replace(/,/ig, ""));
            const max = Number.parseFloat(match[2].replace(/,/ig, ""));
            if (answer <= max && answer >= min) {
              console.log("Matched answer", {min, max, answer});
              return true;
            } else {
              console.log("Unmatched answer", {min, max, answer});
            }
          }
        }
        return false;
      }
    );

    if (answerRadio instanceof WebElement) {
      answerRadio.click();
    } else {
      console.log("No matching answer", answer);
    }
  }

  async waitToLeaveIpvCallback() {
    await this.driver.wait(async (driver) => {
      return (await driver.getCurrentUrl()).endsWith("/ipv-callback") === false
    });
  }
}
